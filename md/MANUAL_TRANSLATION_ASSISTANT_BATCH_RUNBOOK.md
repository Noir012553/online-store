# Quy trình dịch và duyệt thủ công qua tải lên bản dịch (assistant batch)

Tài liệu này là kinh nghiệm thực tế khi dùng luồng **assistant batch import** để dịch và duyệt thủ công, chủ yếu khi provider AI (Cloudflare) hết quota hoặc retry model không đạt chất lượng. Các số liệu ví dụ là snapshot theo thời điểm, không phải trạng thái live. Quy trình chuẩn về retranslate/quality nằm ở [TRANSLATION_RETRANSLATE_QUALITY_INCIDENT_AND_FIX_PLAN.md](TRANSLATION_RETRANSLATE_QUALITY_INCIDENT_AND_FIX_PLAN.md); nhật ký chung ở [SESSION_ISSUES_RESOLVED.md](SESSION_ISSUES_RESOLVED.md).

## 1. Luồng tổng thể

```
Admin UI (trang quản trị translations)
   → Export batch (theo sản phẩm/locale cần xử lý)
   → Dịch ngoài pipeline (khi CF hết quota / 429)
   → Đóng gói JSON theo schema assistant_batch
   → Kiểm tra JSON trước khi upload (validate + preview)
   → Import thật (records vào DB với provider: assistant)
   → Duyệt (approval) qua UI, có điều kiện validator
   → Kiểm chứng sau ghi (đọc lại DB)
```

## 2. Khi nào dùng luồng này

- Cloudflare AI hết quota (HTTP 429) hoặc backlog lớn mà không muốn tiêu Neurons.
- Bản dịch cũ bị validator từ chối (`mixed_language`, `missing_technical_token`, ...) và retry bằng model không hiệu quả.
- Cần chất lượng cao cho sản phẩm chủ lực — người dịch thật kiểm soát từng câu, AI chỉ phụ trợ.

## 3. Đóng gói file JSON — phần dễ sai nhất

Schema bắt buộc:

```json
{
  "workflow": "assistant_batch",
  "records": [
    {
      "productId": "<24-char ObjectId string>",
      "targetLang": "nl",
      "sourceHash": "<hash của Product hiện tại>",
      "translations": {
        "name": "...",
        "description": "...",
        "brand": "...",
        "specs": {},
        "technicalDescription": "...",
        "descriptionImages": [],
        "promotions": []
      }
    }
  ]
}
```

Kinh nghiệm quan trọng:

- **`sourceHash` phải lấy từ Product hiện hành tại thời điểm xuất batch.** Nếu sản phẩm bị sửa sau khi xuất, import sẽ bị chặn/flag `source_content_changed`. Đối chiếu hash trong JSON với DB là điều kiện tiên quyết; trong lượt kiểm chứng gần nhất 51/51 record khớp 100%.
- **Giữ nguyên giá trị bất biến**: model/SKU, brand, thông số kỹ thuật (sensor, DPI, poll rate, weight...), số lần xuất hiện của token kỹ thuật (ví dụ "Focus Pro 35K Gen-2", "8000Hz", "54g"). Dịch sai con số là lỗi nặng nhất; không đoán khi nguồn thiếu.
- **Token kỹ thuật phải xuất hiện đúng số lần như nguồn.** Validator đếm token (`missing_technical_token` / `unexpected_technical_token`). Đã có trường hợp bản de bị chặn vì thiếu token "CS2".
- **Không trộn ngôn ngữ** (`mixed_language`). Đã phát hiện bản còn sót cụm như "på 54g" trong bản de và "van 54g" trong bản en/sv. Validator có thể vẫn chấp nhận với score 50/80, nhưng đó không có nghĩa là sạch — cần soát bằng tay.
- **`technicalDescription`** giữ cấu trúc `"Specificaties: {...JSON object...}"`: dịch nhãn sang ngôn ngữ đích nhưng giữ đúng format JSON inline vì storefront parse chuỗi này.
- **`descriptionImages[].alt`** là optional. `null`, số `0` và chuỗi `"0"` được xem là không có alt: không cần dịch, không hiện ô nhập, không ảnh hưởng readiness. Alt thực chất vẫn được validate như optional warning, không blocker.
- Không nhét credential/token vào JSON.

## 4. Kiểm tra trước khi upload (bắt buộc)

Đã từng có payload bị cắt khi truyền qua PowerShell, giải nén sai shape và import từ chối trước khi ghi record nào. Bài học: luôn verify trước, dừng ngay khi lỗi, không tiếp tục với payload rỗng hay status cache cũ.

Các kiểm tra bằng script (tham khảo `translation-workspace/scripts/`):

1. JSON parse được; `workflow === "assistant_batch"`.
2. Đúng số record, đủ locale dự kiến, không trùng cặp product-language.
3. `sourceHash` khớp với Product hiện hành (đọc DB).
4. Đủ trường required cho từng record.
5. Chạy preview/dry-run: xem `validRecords`, insert/update counts, manual-field skips, lỗi content invariant. Preview lỗi thì dừng tại đó.

## 5. Import thật — điều gì xảy ra trong DB

Sau import, các record có đặc điểm nhận dạng (đã xác minh trong lượt check 2026-10-24):

| Field            | Giá trị                        |
| ---------------- | ------------------------------ |
| `provider`       | `assistant`                    |
| `providerSource` | `assistant_batch`              |
| `qualityStatus`  | `pending` (chưa phải approved) |
| `status`         | `success`                      |

Điểm mấu chốt:

- **Import thành công ≠ approved.** Import chỉ đưa bản dịch vào trạng thái draft/pending; approval là thao tác riêng qua UI.
- **Không giả nhãn Cloudflare.** Record assistant phải mang provenance assistant; không tự đổi thành `cloudflare/primary`.

## 6. Duyệt (approval) — điều kiện và cạm bẫy

- **Validator là điều kiện commit.** Lỗi blocking (token thiếu/thừa, sai ngôn ngữ, field thiếu, hash stale, translation failure) chặn approval; không có đường tắt.
- **Trường hợp duy nhất được override**: lỗi chỉ gồm `inconsistent`. Phải tick xác nhận và ghi review note tối thiểu 10 ký tự nêu rõ cơ sở quyết định. UI hiện hướng dẫn ngay trong dialog vì từng có lần note ngắn hơn mức khiến request không được gửi và không có toast, bị hiểu nhầm là lỗi hệ thống.
- **Không bulk-approve, không sửa `qualityStatus` trực tiếp trong DB** để làm batch xanh.
- **Manual fields được bảo vệ tuyệt đối.** Nếu sản phẩm có `manualFields`, phần ghi bị ảnh hưởng phải dừng; bản máy/assistant không được đè field người thật dịch.
- **Tách bạch `status: success` (provider) và `qualityStatus: approved` (quality pipeline).** Provider trả thành công chỉ nghĩa là nhận được nội dung.
- **Assistant draft không được biến thành bản dịch Cloudflare**; selector có thể bỏ qua record không đủ điều kiện.

## 7. Kiểm chứng sau khi duyệt

Không tin vào thông báo UI — đọc lại DB độc lập:

1. Đọc lại từng locale: `status`, `qualityStatus`, `qualityScore`, `validationErrors`, provenance, `sourceHash`, approval audit.
2. Xác nhận hash từng locale khớp Product hiện tại; hash stale khiến storefront báo `source_content_changed`.
3. Đối chiếu SKU/model/giá — giá trị bất biến không được đổi.
4. Tính lại `translationReady`: chỉ ready khi đủ mọi locale bắt buộc (`en, pt, fr, de, it, es, nl, sv`) đều đạt; không suy từ một locale hay từ số request thành công.
5. Lưu báo cáo ra file UTF-8 (ví dụ `logs/check-batch-status-last.txt`) để tránh lỗi font tiếng Việt trong console Windows.

Kết quả mẫu của lượt kiểm chứng 2026-10-24 (10 sản phẩm Razer, batch 51 record): 80/80 cache docs approved, 51 slot mới đúng provenance `assistant/assistant_batch` cùng timestamp, 29 slot cũ giữ nguyên `cloudflare/primary` không bị ghi đè, 0 hash mismatch, 32 locale score dưới 100 thuộc nhóm "chấp nhận khác biệt bản cũ".

Script kiểm tra chỉ đọc: `translation-workspace/scripts/check-batch-status.js` (chạy `node scripts/check-batch-status.js` từ `translation-workspace`; ghi báo cáo UTF-8 ra `logs/`).

## 8. Số liệu "chấp nhận khác biệt bản cũ"

Các record được duyệt dù score thấp hơn 100 (50 hoặc 80) là nhóm được validator chấp nhận có điều kiện (thường qua override `inconsistent` hoặc opt-in accept-diff). Đây là nơi lỗi chất lượng tiềm ẩn hay nằm — rà lại bằng tay (mixed-language, số liệu kỹ thuật, câu bị cắt) thay vì coi approval là dấu hiệu hoàn hảo.

## 9. Lưu ý khi kiểm tra bằng script

- Collection cache là `product_catalog_translation_cache` với field `entityId` (string) và `targetLang`; không phải `productId`/`language`.
- `products._id` là ObjectId; cast bằng `ObjectId.createFromHexString` trước khi query `$in`.
- `dotenv`/`mongoose` của backend nằm ở `online-store-backend/node_modules`; script trong `translation-workspace/scripts` cần path `../../online-store-backend`.
- Output console Windows có thể vỡ font tiếng Việt: luôn ghi thêm bản UTF-8 ra file bằng `fs.writeFileSync(..., { encoding: "utf8" })` và đọc lại từ file.

## 10. Tóm tắt bài học

1. Hash đúng trước — hash sai là nguyên nhân hàng đầu của import fail/stale.
2. Validate payload ngoài pipeline trước khi upload; lỗi thì dừng, không "cố chạy tiếp".
3. Import và approval là hai bước tách biệt; đừng nhầm.
4. Validator là người gác cổng; đừng nới lỏng nó chỉ để batch xanh.
5. Override `inconsistent` cần note rõ ràng; mọi lỗi khác đều chặn.
6. Luôn đọc lại DB sau ghi; `translationReady` chỉ đúng khi đủ 8 locale.
7. Soát thủ công các record score < 100 — nơi mixed-language và token sai thường trốn.
8. Không ghi secret vào JSON/log; output UTF-8 ra file để tránh lỗi font tiếng Việt.

## 11. Phụ lục — Logout ở admin và các trang bảo vệ (kinh nghiệm phiên 2026-10-30)

Phần này ghi lại chuỗi xử lý lỗi logout ở khu admin (trang như `/admin/translationsDynamic`), gồm redirect, dọn state và toast. Các fix nằm trong `online-store-frontend`.

### 11.1 Triệu chứng và nguyên nhân

| Triệu chứng | Nguyên nhân thật |
| --- | --- |
| Logout xong vẫn đứng yên ở trang admin (chỉ thấy "Loading…") | `_AdminLayout` khi `!user` chỉ render shell "Loading…" và trông chờ `ProtectedAdminPage` redirect; nếu chunk `/login` fetch chậm (production) hoặc auth init treo thì treo vĩnh viễn |
| Logout ở trang storefront thường không đi đâu cả | `useLogoutConfirm` cũ push về **chính trang đang đứng** (`getSafeReturnPath(returnTo)` = `/admin/...` hay trang hiện tại); trang không phải admin không có guard để tự đẩy về `/login` |
| Truy cập trực tiếp trang admin khi chưa đăng nhập bị kẹt "Loading…" mãi | `authAPI.refreshToken()`/`getMe()` treo vô hạn (Atlas M0 đứt kết nối) → `isInitialized` mãi `false` → cả AdminLayout lẫn ProtectedAdminPage đều gate bởi `isInitialized` nên không effect redirect nào chạy |
| Toast hiện nhầm "Đăng nhập thành công" sau logout | Trước fix cả 2 luồng logout đều **không có toast riêng** — toast người dùng thấy là toast login còn lại trên màn hình hoặc từ flow login trước đó |
| Dữ liệu admin (danh sách user, orders, translations) còn nằm trong RAM sau logout | React Query `queryClient` tạo 1 lần ở module level trong `_app.tsx`, `gcTime` 10 phút; logout cũ không gọi `queryClient.clear()` |
| Đăng nhập lại bị refresh bị chặn oan | Key `laptopstore_refresh_blocked_until` (cooldown 429) nằm trong localStorage, không bị xóa khi logout/login |

### 11.2 Các fix đã áp dụng

1. **`src/hooks/useLogoutConfirm.tsx`** — logout từ Header/storefront:
   - Luôn push `/login?from=<trang hiện tại>` sau logout; không bao giờ push về chính trang cũ.
   - Fallback `window.location.assign` khi router chưa ready.
   - Thêm `toast.success(t('logout_success', 'auth'))`.
2. **`src/components/admin/_AdminLayout.tsx`** — logout từ sidebar admin:
   - Effect redirect ngay khi `isInitialized && !user` → `router.replace('/login?from=...')` (belt-and-braces, không phụ thuộc ProtectedAdminPage).
   - Thêm `toast.success(t('logout_success', 'auth'))` trong `handleAdminLogout`.
3. **`src/components/admin/ProtectedAdminPage.tsx`** — giữ effect redirect cũ; chỉ signed-in nhưng thiếu role mới thấy `PermissionDenied`.
4. **`src/lib/context/AuthContext.tsx`**:
   - `logout()` xóa thêm `laptopstore_refresh_blocked_until` (qua `clearPersistedRefreshBlockState()` xuất từ `api.ts`); `login()` cũng gọi để phòng key stale.
   - Deadline 10s cho `refreshToken()`/`getMe()` bằng `Promise.race` — auth init không thể treo vô hạn nữa; timeout → fail closed thành signed-out.
5. **`src/lib/api.ts`** — export `clearPersistedRefreshBlockState()` (reset cả flag in-memory `refreshBlockedUntil` lẫn key localStorage).
6. **`src/pages/_app.tsx`** — hook `useClearQueryCacheOnLogout`: nghe event `auth:logout` → `queryClient.clear()` + `cancelQueries()`; dữ liệu admin không còn nằm trong RAM ~10 phút sau logout.

Safety net cuối: cả `_AdminLayout` lẫn `ProtectedAdminPage` có timeout 12s — nếu `isInitialized` vẫn `false` vì bất kỳ lý do nào thì coi như chưa đăng nhập và redirect về `/login`.

### 11.3 Kiểm chứng bằng trình duyệt ảo (browser automation)

Đã test thật trên `https://manln.online/admin/translationsDynamic`:

- Login `admin@laptop.com` → mở trang → bấm "Đăng xuất":
  - URL cuối: `https://manln.online/login` ✓
  - Form đăng nhập render đầy đủ ✓
  - `sessionStorage.auth_session_active` = null ✓
  - `localStorage.cart` = "[]" ✓
  - `localStorage.laptopstore_refresh_blocked_until` = null ✓
  - 0 console error ✓
- Truy cập trực tiếp trang admin khi chưa đăng nhập (trên prod đang chạy code cũ): kẹt "Loading…" >25s — đúng nguyên nhân 11.1 dòng 3; đã fix bằng deadline + safety net ở trên.

Mẹo khi test logout bằng headless browser: nút logout ở sidebar admin thường ngoài viewport (sidebar thu gọn) — click qua Playwright locator sẽ lỗi "Element is outside of the viewport"; dùng `page.evaluate(() => document.querySelector('button[title="Đăng xuất"]').click())` thay thế. Nút có `title` là `t('logout', 'admin')` (tiếng Việt: "Đăng xuất").

### 11.4 Key i18n cho toast logout

- Key: `logout_success`, namespace: `auth` — đã có sẵn trong backend `src/locales/<lang>/auth.json` cho đủ 9 ngôn ngữ (vi/en/fr/de/es/it/nl/pt/sv), ví dụ vi: "Đã đăng xuất thành công". Không cần seed thêm.
- Phân biệt rõ với `login_successful` (namespace `login`) — đừng dùng nhầm key login cho toast logout.

### 11.5 Phụ lục — Đăng nhập bằng Google (OAuth): kinh nghiệm và lưu ý

Luồng hiện tại: frontend redirect trình duyệt tới `/api/users/auth/google` (qua Next.js rewrite sang backend) → backend dùng Passport Google OAuth2 → callback → backend set httpOnly refresh cookie và redirect về `/login?oauth=google`.

Lưu ý thực tế:

1. **OAuth là full-page redirect, không phải `apiCall`.** Nút Google ở `login.tsx` dùng `window.location.href = '/api/users/auth/google'` — đúng cách; đừng thử fetch POST Google OAuth vì browser phải điều hướng để Google set cookie phía nó.
2. **Chống xử lý callback 2 lần.** `login.tsx` giữ `processedOAuthCallback` (useRef) so với `router.asPath`; nếu không sẽ gọi `googleLogin()` lặp khi effect chạy lại (deps gồm `router.asPath`), tạo token thừa/race.
3. **`googleLogin()` trong AuthContext không nhận email/password** — nó gọi `/users/refresh` để đổi cookie thành access token, rồi `getMe()` lấy profile. Vì cookie do backend set ở bước callback nên thứ tự phải là: callback redirect về `/login?oauth=google` → frontend chạy `googleLogin()`.
4. **Session marker cũng phải set.** `googleLogin()` set `sessionStorage.auth_session_active = "1"` như `login()` thường — thiếu là F5 kế tiếp bị shared-machine guard xóa session (fail closed).
5. **Fail của OAuth trả về `/login` kèm toast lỗi** (`login_failed`) — người dùng thấy lại form, không treo.
6. **Cấu hình cần kiểm tra khi 401/redirect sai sau Google login:**
   - `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` trong backend `.env` khớp Google Cloud Console (authorized redirect URI trỏ đúng domain callback).
   - Next.js rewrite `/api/:path*` trỏ đúng backend port; callback URL backend trả về phải đi qua cùng domain frontend để cookie httpOnly không bị rơi do cross-domain.
   - Cookie `secure`/`sameSite` phải khớp môi trường (https + `sameSite=lax` cho prod).
7. **Sau Google login thành công, redirect theo `from`** như login thường: `router.replace(from)` với `from = getSafeReturnPath(router.query.from)` — giúp quay lại đúng trang admin đã bị logout/kick.

### 11.6 Tóm tắt bài học mở rộng

9. Logout phải là một luồng có đích rõ ràng: luôn kết thúc ở `/login?from=...`, đừng trông chờ trang cũ tự biết đẩy người dùng đi.
10. Mọi request khởi tạo (auth init, refresh, profile) cần deadline — mạng/DB treo thì fail closed, đừng treo UI vĩnh viễn.
11. Sự kiện `auth:logout` là điểm gom dọn trung tâm: CartContext (cart), `_app.tsx` (React Query cache), AuthContext (token/user/session flag/refresh cooldown) đều nghe một event này.
12. Toast phải phản ánh đúng hành động vừa xảy ra; logout thành công cần thông điệp riêng, không dùng lại thông điệp của login.
13. OAuth Google là luồng điều hướng trình duyệt, không phải API call; xử lý callback đúng một lần và luôn set session marker như login thường.

## 12. Phụ lục — Round 7 (batch nov09, 208 records / 36 sản phẩm): kinh nghiệm ngày 2026-11-01

Batch gồm 24 laptop + 12 accessory; export → generator + hand merge → preflight 6 passes → import → approve → kiểm chứng DB. Kết quả cuối: toàn bộ slot được xử lý đều `approved`, 0 validationErrors (đọc lại DB độc lập).

### 12.1 Bài học về validator — ba quy luật gây `not_eligible`

1. **Token kỹ thuật đếm theo cụm kề nhau.** `missing_technical_token: "AKKO 5108"` xảy ra dù cả hai từ đều có mặt — vì từ ngôn ngữ đích chen giữa (`AKKO sans fil 5108`, `AKKO sem fios 5108`, `AKKO trådlös 5108`). Sửa: đảo lại để token–số kề nhau (`AKKO 5108 sans fil`...) trong **cả name, description, technicalDescription, specs**.
2. **False-positive bigram chéo ngôn ngữ.** Giới từ target ngắn khớp normalized từ Việt của nguồn: `do AKKO` (pt) ↔ "đó akko", `White van ASUS` (nl) ↔ "white vẫn", `Night over the Rhône` (en) ↔ bigram nguồn. Sửa bằng diễn đạt lại (`do AKKO` → `o modelo AKKO`; `van ASUS` → `from ASUS`; tên tranh → `Starry Night (Rhône)`) — **không xóa mù từ target**.
3. **Cascade token khi bổ sung câu.** Thêm một câu mới có thể tạo `unexpected_technical_token` (`AKKO 5108-konstruktionen` gạch nối biến thành token dư) hoặc làm lệch đếm `V5`/`V3`. Luôn chạy validator cục bộ trên cả 3 field (`name`, `description`, `technicalDescription`) sau **mỗi** lần patch, đừng đợi import.

### 12.2 Bài học về quy trình

4. **Boilerplate generator ≠ bản dịch.** Bản 8-đoạn chung chung bị `markup_mismatch`/`missing_technical_token` vì nguồn có 15–18 đoạn chi tiết kèm entity `&lt;1%` và model kề (`TUF M4`, `Gladius III`). Khi generator không có nội dung thật cho sản phẩm, phải dịch từ nguồn theo cấu trúc đoạn, không ghép template.
5. **Kiểm chứng DB sau import bắt buộc.** Lần đầu log báo "189/189 imported" nhưng DB thật chỉ 16 doc assistant + phần lớn slot cũ `needs_retranslate`/`source_content_changed` — batch nền bị ngắt giữa chừng. Chạy lại import full-idempotent theo chunk có state file (`import-nov09-full.js`) mới thấy đúng trạng thái.
6. **Dry-run trước khi apply là rào chắn rẻ nhất.** Dry-run bắt 0 record invalid trước khi ghi; script reimport có cờ `--apply` (mặc định dry) và `--shutdown` (tắt backend port 5000 qua `Get-NetTCPConnection`) giúp chạy xong tự dọn.
7. **Phân biệt nguồn skip:** `not_eligible` lúc approve = validator chặn (xem `validationErrors` trong DB, không phải trong response import); import trả `validRecords: n` chỉ nghĩa payload đúng schema.
8. **Fix theo nhóm lỗi, không theo record:** 17 slot pending rơi vào 3 nhóm (markup `&lt;1%` + token `M4`; token `AKKO 5108`; leak false-positive) — một script fix/map per-language xử lý cả nhóm gọn hơn sửa tay từng slot.

### 12.3 Số liệu cuối round 7

- Preflight: 208/208 records, 0 leak sau 6 passes (2 bigram giả cuối: `white van` c6ca/nl, `night over the rhône` c8c3/en).
- Import + approve: 208 slot xử lý xong; 17 slot pending cố định được trong phiên 2026-11-01 (14 slot c6c8/c6ca + 3 slot c645 fr/pt/sv), cuối cùng 17/17 `approved` score 80–100, errs=[] xác nhận bằng đọc lại DB.
- Script đáng nhớ: `import-nov09-full.js` (chunk 8 + state resume), `diag-nov09-exact.js` (validator cục bộ chỉ lỗi), `fix-nov09-pass7-17pending.js`, `fix-nov09-pass8-akko.js`, `reimport-nov09-17pending.js`, `reimport-c645-3.js` (có `--apply`/`--shutdown`), `verify-nov09-17p.js` (đọc DB sau ghi).
