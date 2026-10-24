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

| Field | Giá trị |
|---|---|
| `provider` | `assistant` |
| `providerSource` | `assistant_batch` |
| `qualityStatus` | `pending` (chưa phải approved) |
| `status` | `success` |

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
