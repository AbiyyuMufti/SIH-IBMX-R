# Tuzla OEE source files (2026_OEE_KPI.xlsx and the shift form)

| At a glance | |
|---|---|
| **What** | How the Tuzla site (Turkey) records OEE today: a paper shift form filled by the operators, typed by the shift supervisors into one Excel workbook, whose sheet `Template` feeds the daily, weekly and monthly dashboard sheets. Profile only, step 1 of the as-is recreation |
| **Sources read** | `downloads/05 SITE Tuzla/2026_OEE_KPI.xlsx` and `downloads/05 SITE Tuzla/SD046683-10.0-Vardiya Makina Çalışma Takip Formu.xlsx` (git-ignored, untrusted). Read with openpyxl (values and formulas), no macro, not opened in Excel |
| **Language** | Turkish. Günlük = daily, Haftalık = weekly, Aylık = monthly. Rows 1 and 2 of `Template` also carry Chinese labels (the template was copied from another site, see section 5) |
| **Status** | Profile done 2026-11-19. Next: column map to the report tables, then recompute one day and compare with `Günlük` |

## 1. How the data flows
1. Operators fill the paper form **Vardiya Makina Çalışma Takip Formu** (shift machine tracking form) per line and shift: up to 4 products (start, end, code, cases, machine speed, staff, order number), stop minutes per reason, waste (Fire) per material, and a stop detail list (reason, start/end, minutes).
2. At shift end the supervisor types the form into `2026_OEE_KPI.xlsx`, sheet `Template` (Excel table `表12_4`): **one row per line, day, shift and order**. Only white cells are input; the rest are formulas.
3. `Günlük` (daily dashboard, the first screenshot), `Haftalık`, `Aylık` and `Üretim Raporu` (factory daily production report) read `Template` for the chosen day, week or month.

## 2. Template (the only input sheet)
1,572 rows, 5 Jan to 17 Nov 2026. Header in row 4, data from row 5.

| Lines (column B) | Rows | Group (as in `Günlük`) |
|---|---|---|
| Corniani-1, Corniani-2, Corniani-3 | 266, 267, 283 | Likit Hatlar (liquids) |
| ACMA, FFS, Doypack | 301, 299, 156 | Toz Hatlar (powders) |

Shifts (column H): Gündüz (day) 1,438 rows, Gece (night) 134 rows.

### Columns
| Columns | Meaning | Input or formula |
|---|---|---|
| B | Üretim Hattı = line | input |
| C | Sipariş Numarası = order (PO) number | input |
| D, E, F | Tarih = date; Ay = `MONTH(D)`; Hafta = `WEEKNUM(D,1)` | D input, E and F formula |
| G | Hat Sorumlusu = line lead (a person's name: never copy to docs or tables) | input |
| H | Vardiya = shift (Gündüz / Gece) | input |
| I, J, K, L | Ürün Kodu = SKU code; name, formula and CC (units per case) from sheet `SKU info` | I input, J to L lookup |
| M | Teorik Hat Hızı = theoretical speed, units per hour | input |
| N | Gerçekleşen Hat Hızı = actual speed, units per hour | input in 994 rows, a formula such as `=55*60` in 578 |
| O | Personel Sayısı = staff count | input |
| P, Q, R | start, end, total operation time `MOD(Q-P,1)*1440` minutes | P, Q input |
| S, T | Üretilen Miktar: cases (input), units `= S * CC` | |
| U | Teorik Üretim Miktarı = theoretical units `= AC * M / 60` | formula |
| V | **OEE `= T / U`** | formula |
| W, X, Y | share of planned stops, unplanned stops, rejects in `R - (Z:AB)` | formula |
| Z, AA, AB | not planned time: Üretim Planı Yok (no plan), Eğitim & Toplantı (training, meeting), Deneme (trial) | input, minutes |
| AC | Net Operasyon Süresi = net operation time `= R - SUM(Z:AB)` | formula |
| AD to AM | **Planlı Duruşlar** (planned stops, minutes): Formül Değişikliği (formula change), Ebat Değişikliği (size change), Yemek (meal), Çay (tea break), Analiz ve Kontroller (QC checks), Planlı Bakım (planned maintenance), Genel Temizlik & Hat Kontrol, Temizlik & Sanitasyon, Ambalaj/Etiket Besleme, Yarı Mamül Besleme (material feeding) | input |
| AN to BI | **Plansız Duruşlar** (unplanned stops, minutes): power/air cut, waiting for staff / plan / bulk / packaging, emergency evacuation, quality problems (3), Makine Ayarı (machine set-up), breakdowns per machine (bottle unscrambler, filler, coder, labeller, case packer, case barcode, other), Kısa Duruşlar (short stops), speed reduction / missing staff, other stops | input; BH and BI formula |
| BH | Düşük Hızda Çalışma = speed loss `(1 - N/M) * AC` | formula |
| BI | Diğer = remainder: net time minus run time minus all stops | formula |
| BJ | Fire (dk) = rejects as minutes `CB / M * 60` | formula |
| BK | Gerçekleşen Üretim Süresi = run time at theoretical speed `T / M * 60` | formula |
| BM to CA | the same losses as **units** (minutes × M / 60), grouped as on `Günlük` (Hat Dönüşümü, Mola, Arıza, ...) | formula |
| CB, CC | rejected units (input), produced units | |
| CE to CO | helper groups for the dashboards | formula |

### OEE rule
`OEE = good units / (net operation time × theoretical speed / 60)`. Net operation time is total time minus no plan, training and trial (Z:AB). **Planned stops (AD:AM) stay inside the base**, so breaks, changeovers and cleaning lower the OEE. `Günlük` shows the loss bars in units (BM:CA) and their share of the theoretical units; the bars plus OEE add up to 100 %.

## 3. Dashboard and helper sheets
| Sheet | Job |
|---|---|
| Günlük | daily dashboard: factory and per line output, OEE vs target, loss bars, absence and quality-system counters (CC / CAPA overdue, deviations) |
| Haftalık, Haftalık Grafik | weekly dashboard and chart |
| Aylık | monthly dashboard (month number in C2, Turkish month names) |
| Üretim Raporu | factory daily production report: cases and units per line |
| 2026 Target | OEE target per month 2026, factory, Powders (ACMA, FFS, DOYPACK) and Liquids (Corniani-1 to 3) |
| SKU info, Eski Hızlar, Line speed register | SKU master (name, formula, CC), old and current line speeds |
| WO Info | work orders |
| Devamsızlık, Gün Bazlı Devamsızlık, Haftalık Devamsızlık | absence (personal data: out of scope) |
| Quality One | quality events |
| Line Utilization, OEE segmentation | Reckitt time model (Level 1 to 3 with explanation) |
| OEE Aggregation | Reckitt aggregation example with another site's lines (AL1#, LHW1#), not Tuzla data |

## 4. The shift form (SD046683-10.0)
Sheets `Sheet1`, `New`, `New (2)` to `New (4)` are versions of the same form. `Sheet1` has: line and shift header; 2 shifts × up to 4 products; stop reasons with minutes per shift (planned: trial, planned maintenance, planned shutdown; waiting: staff, material, utilities; breaks: meal, tea; product change: formula, size; cleaning; QC checks; out-of-spec material; stops over 12 h; meetings and training; TPM checks; mechanical and electrical breakdowns; machine set-up; other; packaging change); waste per material (case, label, cap/trigger, box/foil) per shift; a stop detail list of 10 lines per shift.

The form's reasons and the Template columns differ a bit (the form has TPM checks, out-of-spec material and stops over 12 h; Template has per-machine breakdowns). To check with the site when the map is built.

## 5. Open points
- Template row 1 and 2 (Availability / Performance / Quality Loss groups) carry Chinese text, and `OEE Aggregation` holds another site's lines: the workbook was built from a template of another Reckitt site.
- Column N (actual speed) is a formula such as `55*60` (= 3,300/h) in 578 of 1,572 rows. Low priority: N does not change the OEE (`T / U` does not use it); it only moves minutes between the speed loss (BH, EU `Reduced Speed`) and the remainder (BI, `Others`).
- No hourly data: one row per line, day, shift and order, so `Run_Rates_EU` (one row per machine and hour, from Provideam counts) cannot be filled, the same as Chartres. A shift-level rate (`T / BK`) exists but is not the same grain.
- Night shift rows are few (134): ask whether night is entered as its own row or merged into the day row.
- Map the Turkish reasons to the EU loss tree (`Daily_Losses_EU`) before any conversion.
