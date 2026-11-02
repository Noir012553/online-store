# Nhật ký phiên 2026-10-30 — Lỗi frontend, import bản nháp, và retranslate storefront

Phiên này xử lý chuỗi: lỗi console trên admin (401 refresh, ERR_CONNECTION_CLOSED, import 500) → import 63 bản nháp assistant → chạy retranslate storefront 3 lượt (966 → 54 → 148 jobs). Trạng thái DB/log là snapshot tại thời điểm chạy, không phải dữ liệu live.

Xem thêm: [TRANSLATION_SESSION_ISSUES_2026-10-21.md](TRANSLATION_SESSION_ISSUES_2026-10-21.md) (cải tiến validator/prompt trước đó), [MANUAL_TRANSLATION_ASSISTANT_BATCH_RUNBOOK.md](MANUAL_TRANSLATION_ASSISTANT_BATCH_RUNBOOK.md) (quy trình batch), [TRANSLATION_RETRANSLATE_QUALITY_INCIDENT_AND_FIX_PLAN.md](TRANSLATION_RETRANSLATE_QUALITY_INCIDENT_AND_FIX_PLAN.md) (quy trình chuẩn).

## 1. Lỗi console admin: 401 refresh, ERR_CONNECTION_CLOSED

### Chẩn đoán

- **`/api/users/refresh` 401 → session văng**: refresh token cookie hết hạn hoặc bị revoke bởi token rotation (refresh cũ mất giá trị khi đã quay token mới). Backend trả 204 khi chưa login (healthy); 401 + clear cookie khi token invalid/jti không khớp `refreshTokenId`. Frontend `api.ts` refresh fail (khác 429) → `handleUnauthorized()` + toast `error_session_expired`. **Xử lý: đăng nhập lại, không phải bug backend.**
- **`/api/orders` `net::ERR_CONNECTION_CLOSED` liên tục**: backend healthy khi bơm 20 request trực tiếp (0 lần đứt). Nguồn thực tế: MongoDB Atlas free tier (M0) bị đứt kết nối ngắn khi cùng lúc tiến trình retranslate ghi dồn vào cluster. Lưu ý frontend **không retry GET khi lỗi mạng** (chỉ retry 500/502/503/504) nên lỗi lộ thẳng ra console.
- `globalLimiter` skip ở `NODE_ENV=development`; refresh limiter 30/h per user/IP; login 5/15min.

### Bài học

- Khi thấy lỗi mạng ở frontend, phân biệt 3 tầng: trình duyệt → Next.js rewrite/tunnel → backend. Backend healthy + tunnel hoạt động thì nghiêng về tầng nguồn dữ liệu (Atlas) hoặc proxy timeout.
- Batch retranslate chạy song song với app dùng chung Atlas cluster làm mọi request chậm và dễ đứt — tránh chạy batch lúc có traffic.

## 2. Import bản nháp 500 ("Không thể nhập bản nháp.")

### Nguyên nhân thật (đã xác minh bằng test trực tiếp)

Không phải bug code. Backend xử lý đúng: payload 63 records qua sạch mọi bước validate (record format, source hash khớp DB, invariant `descriptionImages`/`promotions`, normalize nội dung). Vấn đề là **thời gian**: chunk 10 records tốn 15–26 giây (validator chạy trên description ~3.400 ký tự/record), full file 1,1MB trong 1 request ~110 giây → Cloudflare Tunnel/proxy cắt kết nối khi response chậm → browser nhận 500/đứt → toast `assistant_batch_import_failed` ("Không thể nhập bản nháp.").

### Đã xử lý

- Import nốt toàn bộ batch `assistant-batch-import-next.json` theo chunk 10 (HTTP 200 toàn bộ), **63/63 records imported**, `provider=assistant`, `qualityStatus=pending` chờ duyệt.
- Cleanup scripts tạm.

### Bài học / quy trình

- Import batch lớn **luôn để UI chạy theo chunk** (UI đã có chia chunk + retry khi proxy fail), tránh gộp 1 request khi qua tunnel.
- Không import khi `retranslate:storefront` đang chạy.
- Script tham khảo đã dùng: đăng nhập qua `/api/users/login` lấy accessToken, POST `/api/translations/admin/products/import` với `{records (chunk), idempotencyKey: duy nhất mỗi lần, assistantBatch: true, dryRun: false}`, nghỉ ~500-800ms giữa chunk. Dry-run trước bằng `dryRun: true` để soi lỗi validate không tốn chi phí.

## 3. Duyệt batch: 36 duyệt mới / 27 còn chờ

Kết quả UI khớp DB (đối chiếu trực tiếp): 36 approved (trong đó 15 override `inconsistent`), 27 pending `provider=assistant` chưa duyệt.

Breakdown 27 pending: `unexpected_technical_token` ~11, `missing_technical_token` ~13, `missing_brand` ~9, `inconsistent` ~9, `truncated` 3, `mixed_language` 2 (một record có thể có nhiều lỗi).

**Điểm mấu chốt:** chỉ `inconsistent` + `mixed_language` nằm trong `ASSISTANT_APPROVABLE_WITH_REVIEW` (override được qua UI). Lỗi token/brand/truncated là lỗi chất lượng thật (draft sai spec so với nguồn) — backend chặn đúng, không nên force approve.

Đường xử lý: nhóm pending này **không** được storefront selector pick up (`provider=assistant` không đủ điều kiện); phải duyệt tay qua UI hoặc dịch lại. Không nhầm với backlog cloudflare.

## 4. Ba lượt retranslate storefront: số liệu và pattern

### Lượt 1 (966 jobs, chạy ~2.5h)

- Kết quả: 0 failed, ready 279 (từ ~7), needsReview **808**, stop `needs_review`.
- Bơm dry-run phân loại 823 remaining: **~90% là stale/missing** (`missing_description` 549, `stale_source_hash`+`source_content_changed` 513, `missing_specs` 374, `missing_translation` 216) — nguồn sản phẩm đổi sau seed/scrape nên bản cũ hết hạn. Nhóm token lỗi chỉ còn ~25 jobs (~3%) — **exempt token-check cho description đã phát huy đúng tác dụng**.
- Nhóm stale/missing bắt buộc dịch mới, không có tắt validator rút ngắn; ước tính ~8-11k calls.

### Lượt 2 (tiếp tục từ checkpoint, dừng ở job 54)

- Dừng an toàn vì quota: `no untried key available`, nhiều key cooldown dài (523s, 252s...). Ready 281.
- Pattern mới: nhóm keyboards/mice (`6ad0cb68...611/612/613`) fail lặp `missing_technical_token` + `too_long` xuyên suốt nhiều locale — lỗi cố định theo nguồn specs dài, chạy lại sẽ lặp kết quả.

### Lượt 3 (tiếp tục, dừng ở job 148)

- `needsReviewCount` nhảy **39 → 136**: gần như mỗi job fail `mixed_language`. Retry "dịch lại từ nguồn" vẫn không pass — model lại để sót tiếng Việt (heading-leak). Đây là **vòng lặp đốt quota**: lần chạy sau sẽ dịch lại toàn bộ từ đầu (checkpoint chưa pass bị clear) với khả năng fail như cũ.
- 2 lượt gần nhất tiêu ~400+ calls nhưng ready chỉ tăng 279→284. **Phải xử lý nguyên nhân prompt trước khi chạy lượt 4.**
- Stop vì quota lần nữa (`rate_limited`), ready 284, remaining 798.

### Bài học quota/tốc độ

- Tốc độ thực: ~5.7 calls/job khi stale (không reuse được candidate); mỗi locale 1 sản phẩm ~15-25 calls (description 2 chunks ~3-6s/chunk + technicalDescription + specs + promotions).
- 823 jobs kiểu này ≈ **15–24 giờ chạy thuần**, thực tế chia 2-3 đêm nếu quota Neurons không đủ một mạch.
- 429 xuất hiện sớm hơn dự đoán; cooldown exponential lên tới 900s (15 phút). Khi nhiều key vào cooldown cùng lúc, job kế tiếp fail ngay.
- Tổng dùng từ đầu phiên: ~858 + ~300 + ~250 calls cho 3 lượt.

## 4b. VNPAY chữ ký IPN (pattern đã fix từ trước, giữ làm kinh nghiệm)

Xác minh code hiện hành `src/adapters/payment/VnpayAdapter.js`: đã có 2 formatter riêng, đúng chuẩn:

- `createVnpaySignatureString` — tạo URL thanh toán: `vnp_OrderInfo` **giữ nguyên** (không encode), các param khác URL-encode (`%20` → `+`).
- `createVnpayIpnSignatureString` — verify IPN/webhook: **re-encode toàn bộ** value đã bị Express decode (`encodeURIComponent` + `%20` → `+`), vì VNPAY tính HMAC-SHA512 trên chuỗi có dấu `+` chứ không phải khoảng trắng.

Bẫy kinh điển: Express decode `Thanh+toan` thành `Thanh toan` trong `req.query`; nếu hash trực tiếp chuỗi decoded thì chữ ký luôn sai (`invalid signature`). Regression test: `npm run test:vnpay:signature` (`vnpay-signature-fix.test.js`) — so sánh hash cũ/sai và mới/đúng trên cùng payload webhook. Test sandbox tổng hợp: `npm run test:vnpay` (cần `VNPAY_TMN_CODE`/`VNPAY_HASH_SECRET`).

Bài học: với cổng thanh toán có chữ ký HMAC, phải biết chính xác **bên nào encode gì trước khi hash**; khi verify callback luôn dựng lại chuỗi signature từ giá trị đã decode theo đúng format bên gửi. Test lỗi encode bằng literal payload mẫu (không gọi cổng thật).

### Cloudflare Tunnel + webhook

- Webhook VNPAY gọi về `/vnpay-api/webhook/:gateway` ở **root level**, đặt trước `/api/*` và trước global rate limiter trong `app.js` để không bị chặn; route alias `/api/payments/webhook/vnpay` vẫn giữ.
- Khi deploy qua tunnel: webhook từ VNPAY đến qua domain public (tunnel) nên callback URL trong `.env` phải là domain public tunnel, không phải localhost.

## 5. Deploy qua Cloudflare Tunnel: kinh nghiệm tích lũy

- **Tunnel config**: `npm run tunnel` dùng `scripts/tunnel.js` + `.cloudflared/config.windows.yml`. Backend bind localhost, tunnel expose ra `backend.manln.online`; frontend Next.js rewrite `/api/:path*` → `NEXT_PUBLIC_API_BASE_URL` (mặc định production domain). CORS allowlist gồm `manln.online`, `backend.manln.online`, localhost.
- **Bẫy binary**: từng gặp `cloudflared.exe` là Git LFS pointer (file văn bản) → `spawn UNKNOWN`. Kiểm tra header `MZ` trước khi spawn (`hasWindowsExecutableHeader`); fix là tải binary Windows chính thức thay file pointer.
- **Timeout khi response chậm**: tunnel/proxy cắt kết nối với request xử lý ~110s (case import 500 ở mục 2). Request nặng phải chia chunk; không tăng vô hạn timeout mà giảm size payload.
- **trust proxy**: backend set `trust proxy 'loopback'` để lấy đúng IP client từ header khi qua tunnel; rate limiter per-IP chỉ chính xác khi cấu hình này đúng.
- **HTTP 530 / lỗi 1033** (Argo Tunnel error) = tunnel không tới được upstream backend — kiểm tra tunnel process và port trước khi nghi ngờ app.

## 6. Shutdown khi rate-limited (đề xuất chưa áp dụng)

Logic hiện tại (`retranslate-storefront-backlog.js` + `retranslateStorefrontOutcome.js`): shutdown **chỉ** khi `complete` (remaining=0, failed=0, needsReview=0). Hết quota giữa đường → máy thức. Đây là chủ ý an toàn-first (ghi trong nhật ký cũ: "shutdown chỉ sau khi backlog sạch").

Hệ quả thực tế: quota không đủ kéo hết batch trong 1 đêm → máy luôn thức đến sáng.

Đề xuất đã đưa ra (chưa sửa): cho phép shutdown cả khi `stopReason === 'rate_limited'` — điểm dừng này an toàn có kiểm soát (checkpoint ghi đĩa xong, DB lock đã release):

```js
if (options.shutdownAfter && (outcome.complete || outcome.stopReason === 'rate_limited')) {
  shouldShutdown = true;
}
```

Vẫn không shutdown khi needs_review/job fail thật (cần người nhìn report). Nếu áp dụng cần update test tương ứng.

## 8. Bảo mật shared-machine: admin/khách lần lượt login/logout cùng máy (đã vá 2026-10-30)

### Đánh giá rủi ro (audit code trước khi vá)

Các lớp có sẵn: logout revoke access token + `refreshTokenId: null`; login đè cookie; cookie httpOnly; reset password vô hiệu mọi phiên cũ. **Điểm yếu thực tế:** nếu user (đặc biệt admin) đóng tab mà KHÔNG logout, cookie refresh sống 7 ngày; người kế tiếp mở web → `initializeAuth` tự gọi `/refresh` → bị đăng nhập âm danh tính user trước (`sameSite: 'lax'` cho phép cookie gửi theo điều hướng top-level).

### Đã vá (3 thay đổi)

1. **`sameSite: 'strict'` cho admin/super-admin** (login, register, refresh rotation, Google OAuth callback — 4 chỗ set cookie trong `userController.js`; role được nhúng vào refresh token payload qua `generateTokenPair(id, role)` trong `generateToken.js`). Cookie admin không còn được gửi khi điều hướng ngoài → máy dùng chung an toàn hơn; user thường giữ `lax` để UX email/zalo không vỡ.
2. **sessionStorage guard chống auto-restore** (`AuthContext.tsx`): login/googleLogin set `sessionStorage.auth_session_active = "1"`; logout xóa. `initializeAuth` khi mới mở tab: nếu flag KHÔNG tồn tại (tab mới sau khi tab cũ đóng — sessionStorage chết cùng tab) → gọi `/logout` để revoke cookie mồ côi phía server, xóa state, **không** tự khôi phục phiên. Nghĩa là: đóng tab mà không logout → phiên tự chết khi người kế tiếp mở web (thay vì họ bị signin-as-user-trước). F5/điều hướng bình thường giữ nguyên vì sessionStorage sống qua reload trong cùng tab.
3. Fail-closed: nếu `sessionStorage` không khả dụng → coi như không có phiên, không auto-restore.

### Lưu ý kiểm thử (chưa chạy browser E2E)

- Kịch bản cần kiểm: (a) F5 giữ đăng nhập; (b) đóng tab → mở tab mới → không bị đăng nhập lại, cookie đã bị revoke; (c) admin login → đóng tab → user thường mở web → không thấy session admin; (d) cookie admin không gửi khi click link ngoài (strict); (e) Google OAuth login vẫn hoạt động (flag được set trong `googleLogin`).
- `node --check` backend pass; frontend `npm run typecheck` pass.

## 9. Việc đang treo (trạng thái cuối phiên)

1. **Phân tích 1 bản dịch fail `mixed_language` thực tế** (checkpoint/DB của job `641 nl` hoặc `648 fr`) để tìm cụm tiếng Việt bị leak — nếu là pattern heading cụ thể thì bổ sung retry instruction (như đợt trước, có regression test) sẽ gỡ hàng chục jobs gần như miễn phí. **Chưa chạy — người dùng đã đồng ý cho phân tích.**
2. Cân nhắc sửa shutdown-when-rate-limited (mục 5).
3. 27 pending assistant batch: duyệt tay qua UI (`/admin/translationsDynamic`) khi rảnh — chỉ override được nhóm `inconsistent`/`mixed_language` với note ≥10 ký tự; nhóm token/brand để retranslate xử lý.
4. Lượt retranslate tiếp theo: chỉ chạy sau mục 1; dùng `npm run retranslate:storefront -- --apply --shutdown`, checkpoint tự bỏ qua phần đã xong.

## 10. Kinh nghiệm chung rút ra

- **Checkpoint là mạng an toàn thật sự**: 3 lượt bị 429 ngắt nhưng không mất progress; chạy lại tiếp tục từ vị trí dừng. Không bao giờ xóa `.retranslate-progress/` thủ công.
- **Luôn dry-run phân loại trước khi chạy apply** khi backlog lớn — bản phân loại (reasons per job) quyết định có nên chạy hay phải sửa validator/prompt trước.
- `needsReviewCount` tăng nhanh trong khi ready không tăng = dấu hiệu **lặp vô ích**; dừng chạy, phân tích nguyên nhân trước.
- Validator exempt theo entityType (description bỏ token-check) giảm mạnh retry — nhưng chỉ áp cho văn xuôi marketing; specs/technicalDescription vẫn giữ check nghiêm vì là dữ liệu cứng.
- Khi report số liệu (`remainingJobs`, counters) không tự khớp tổng — đối chiếu cách tính trước khi kết luận (bài học từ snapshot batch trước).

## 9. Kinh nghiệm triển khai Login/Signup/Auth (pattern đã ổn định trong dự án)

Kiến trúc đã xác minh qua code (`userController.js`, `generateToken.js`, `tokenConfig.js`, `User.js`, `authMiddleware.js`, `api.ts`):

### Cặp token: access ngắn + refresh dài trong httpOnly cookie

- **Access token**: 60 phút (mặc định `JWT_ACCESS_EXPIRES_IN || '60m'`), type `access`, gửi trong response body, frontend giữ **trong memory** (`inMemoryAccessToken`) chứ không localStorage — chống XSS.
- **Refresh token**: 7 ngày, type `refresh` + `jti` (UUID), **chỉ nằm trong httpOnly cookie** (`secure` khi production, `sameSite: lax`), không bao giờ trả trong body.
- `tokenConfig.js` fail-fast khi thiếu secret hoặc algorithm ≠ HS256 — startup chặn sớm thay vì lỗi runtime.

### Token rotation + jti check (chống replay)

- Mỗi lần refresh tạo **cặp token mới**, gán `refreshTokenId` (jti) mới vào User, và chỉ swap khi filter `{ _id, refreshTokenId: decoded.jti }` match đúng 1 (`rotationResult.modifiedCount === 1`, dùng `updateOne` có điều kiện chứ không findById+save để tránh race).
- Refresh token cũ tự vô hiệu vì jti không còn khớp → token bị đánh cắp dùng 2 lần sẽ bị phát hiện (cái sau vào, cái trước chết).
- Verify callback: nếu jti sai/không có → 401 + `clearCookie` + user phải đăng nhập lại.

### Logout & revocation

- Logout: blacklist access token vào `TokenBlacklist` (`revokeToken(token, id, 'logout')`), clear cookie refresh.
- `protect` middleware kiểm tra **blacklist trên mỗi request** (`isTokenRevoked`) trước khi gán `req.user` — JWT stateless nên cần lớp này để revoke có nghĩa.
- Đổi mật khẩu cũng revoke access token hiện tại (`reason: 'password-change'`).

### Frontend auto-refresh chống race

- `api.ts`: khi nhận 401 → gọi `POST /users/refresh` (credentials include) → retry request cũ **1 lần** (`retry: true` flag chống vòng lặp vô hạn).
- Chống concurrent refresh: nếu nhiều request 401 cùng lúc, chỉ 1 promise refresh chạy (`authRefreshPromise`/`isRefreshing`), các request khác await chung.
- Chống refresh-spam: khi refresh trả 429, block refresh thêm `Retry-After` giây (persist qua localStorage), trả `rate_limited` thay vì gọi tiếp.
- Logout khi: refresh fail, hoặc backend trả `code: USER_NOT_FOUND` (user bị soft-delete giữa session).

### Bẫy đã gặp (ghi lại từ phiên này)

- **401 refresh sau token rotation**: refresh cũ bị revoke sau khi quay token mới là hành vi đúng — nhiều request retry song song với token stale sẽ bị từ chối; frontend phải dùng chung 1 promise refresh (đã làm như trên).
- **Cookie không đến nơi khi qua proxy/tunnel**: `secure: true` trong production yêu cầu HTTPS end-to-end; nếu tunnel serve http thì cookie bị browser bỏ → refresh luôn 401 mà không có log lỗi rõ ràng.
- **Soft-delete user**: `protect` và login đều lọc `isDeleted: false`; token của user bị xóa sẽ chết ngay ở bước lookup, trả `USER_NOT_FOUND` (errorCode riêng để frontend phân biệt với mật khẩu sai).
- **Thêm field mới vào login response** phải cùng lúc cập nhật type ở frontend và i18n message key nếu lỗi — nhiều chỗ dùng message key chung `auth-messages.*` qua `getMessage(req.lang, ...)`, thiếu key sẽ hiển thị key raw trên UI.

### Rate limit theo tầng

| Endpoint | Giới hạn | Key |
|---|---|---|
| `POST /users/login` | 5 / 15 phút | IP |
| `POST /users` (register) | 3 / giờ | IP |
| `POST /users/refresh` | 30 / giờ | `refresh_user_<id>` decode từ cookie, fallback IP |
| forgot/reset password | 3 / giờ | IP |
| global `/api/*` | 100 / 15 phút (skip khi `NODE_ENV=development`) | IP |

`refreshTokenLimiter` decode JWT từ cookie **không verify** chỉ để chọn key — đúng vì chỉ cần group, còn verify thật nằm ở controller.

### Checklist khi tái sử dụng pattern này cho dự án khác

1. Cookie refresh: `httpOnly + secure + sameSite=lax + path=/`, không bao giờ trả refresh trong body.
2. Rotation có điều kiện (`updateOne` match jti cũ) — không dùng findById rồi save (race condition).
3. Access token trong memory frontend, refresh tự động 1 lần/request, chống concurrent + chống spam.
4. Blacklist cho logout/đổi mật khẩu, kiểm tra trong protect.
5. Fail-fast config secret khi startup.
6. Email verification token lưu **hash** trong DB, gửi raw qua link (pattern `generatePasswordResetToken` đã dùng chung cho verify-email và reset-password).
7. Log auth fail phải phân loại stage (`token extraction` → `token type validation` → `revocation check` → `user lookup`) để debug nhanh mà không lộ chi tiết nhạy cảm.

## 12. Fix UX logout trên trang admin (2026-10-30)

**Bug:** logout khi đang ở trang admin → `ProtectedAdminPage` render "Access Denied" với nút "Quay lại Dashboard" trỏ về `/admin/dashboard` → người dùng bị kẹt trong vùng admin (vòng lặp Access Denied), không có lối về trang khách hay trang login.

**Fix** (`ProtectedAdminPage.tsx`): tách 2 nhánh theo trạng thái đăng nhập:

- `!user` (đã logout/chưa đăng nhập) → `router.replace('/login?from=<asPath>')` — về trang login, giữ path gốc để đăng nhập lại quay đúng chỗ (`/login` đã hỗ trợ qua `getSafeReturnPath(router.query.from)`); trong lúc chờ render `null` (không flash Access Denied).
- Có `user` nhưng thiếu quyền → giữ màn Access Denied như cũ (đúng ngữ nghĩa: người này đã đăng nhập nhưng không đủ role).

Typecheck pass. Cần smoke test: logout ở `/admin/products` → về `/login?from=...`; login lại admin → quay lại đúng `/admin/products`.

**Follow-up (cùng ngày):** màn trắng khi logout trên production (`manln.online/admin/...`). Nguyên nhân: khi logout, `ProtectedAdminPage` (return `null`) VÀ `_AdminLayout` (return `null` khi `!user`) cùng render null trong lúc client-side navigation sang `/login` đang fetch chunk — nếu navigation chậm/interrupted (production bundle qua tunnel) thì kẹt trang trắng. Fix bổ sung: `_AdminLayout.tsx` khi `!user` giờ render minimal shell (không còn `return null`) nên trang không bao giờ trắng hoàn toàn; ProtectedAdminPage giữ nguyên redirect logic. Lưu ý: trang trắng bạn thấy là **bundle production cũ chưa chứa cả 2 fix** — cần deploy lại frontend rồi kiểm tra lại.

- **Không coi dry-run là chỉ đọc hoàn toàn**: dry-run vẫn kết nối MongoDB và lấy distributed run lock; hai dry-run song song sẽ khóa nhau.
- **`--limit=N` giới hạn số nhóm sản phẩm-ngôn ngữ, không phải số lần gọi AI** — một job phát sinh nhiều request theo số field cần dịch; ước lượng quota luôn tính theo field, không theo job.
- **Token/quota Cloudflare**: token hoạt động + đọc được danh sách model KHÔNG chứng minh còn Neurons; endpoint API không trả số quota còn lại — chỉ xem được trong Cloudflare Dashboard. Không ghi token/API key vào log hay md.
- **Seed/pipeline**: `npm run seed` full mode có thể gọi crawler; dùng `--skip-scrape`; upsert ≠ xóa toàn bộ nhưng Review seeder có `deleteMany`; tuyệt đối không chạy `npm run clear` để xử lý lỗi dịch/rate limit.
- **Sửa nguồn sản phẩm phải đồng bộ bản dịch**: đánh dấu machine-managed translations `needs_retranslate`, giữ manual fields, đặt readiness về chưa xác nhận; không tự đánh dấu approved.
- **PowerShell + tiếng Việt**: pipe JS chứa tiếng Việt qua `node -` có thể hỏng do code page — dùng escape Unicode hoặc ghi vào file UTF-8.
- **JSON scrape ≠ Product document ≠ Translation cache**: đối chiếu qua `sku` + `sourceProductId`, đọc riêng từng trường trước khi sửa; specs key chuẩn hóa (`connection`) khác nhãn crawler (`Phương thức kết nối`).
- **An toàn phạm vi**: không xóa DB, không chạy build chỉ để test xanh, số liệu luôn ghi chú là snapshot.
