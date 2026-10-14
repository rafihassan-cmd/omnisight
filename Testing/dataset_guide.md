# E-commerce Sales Demo Dataset – Guide

File: `ecommerce_sales_messy.csv` (2,445 rows, 11 columns, year 2025)

## 1. Data cleaning challenges (planted on purpose)
| Column | Problem | Fix |
|---|---|---|
| transaction_unique_id | 45 exact duplicate rows | `drop_duplicates()` |
| buyer_account_code | some lowercase (`acc-1050`) | `.str.upper()` |
| buyer_age_years | blanks, and outliers (-1, 0, 150, 999) | treat <13 or >100 as NaN, fill with the account's other ages or median |
| buyer_gender_category | `M`, `male`, `FEMALE`, `Other`, `NB`, blanks | map to Male / Female / Non-binary, blanks to "Unknown" |
| item_product_category | wrong case, extra spaces, `Home&Kitchen`, blanks | `.str.strip()`, standardise names |
| item_unit_price | `$` suffix, some missing the `$`, spaces, `N/A`, `0.00$` | strip `$` and spaces, `to_numeric`, drop or impute 0 / N/A |
| item_purchase_quantity | 0, negatives, blanks | remove invalid rows |
| item_discount_applied_pct | some written as `15%`, blanks | strip `%`, fill blank with 0 |
| transaction_timestamp_str | 4 formats (`2025-03-14 18:42:10`, `14/03/2025 06:42 PM`, `Mar 14, 2025 18:42`, `2025/03/14`) | `pd.to_datetime(..., format="mixed", dayfirst=True)` |
| feedback_star_rating | blanks, invalid values (0, 6, 9) | keep only 1-5, leave the rest as NaN |
| fulfillment_shipping_fee_usd | blanks, negative values | NaN for negatives, impute by category / order value |

## 2. Insights hidden in the data
1. **Price vs rating**: higher price means lower average rating (about 4.6 stars under $25, about 3.3 stars above $500). Use a scatter plot or a bar chart by price band.
2. **Holiday spikes**: Valentine's Day (Feb 14), Mother's Day week, Summer sale (Jul 15-16), Halloween, **Black Friday (Nov 28)**, **Cyber Monday (Dec 1)** and the Christmas rush (Dec 15-24). Use a daily line chart and annotate the peaks.
3. **Age vs category**: under 25 prefer Gaming and Fashion; 25-39 prefer Electronics; 40-54 prefer Home & Kitchen, Garden and Toys; 55+ prefer Books, Garden and Health & Fitness.
4. **Gender vs category**: Beauty and Fashion skew female, Gaming and Electronics skew male.
5. **Discounts**: higher discounts appear mostly on holidays and lead to higher quantities per order.
6. **Shipping**: orders of $100 or more mostly ship free, small orders pay $3.99-$5.99.
7. **Seasonality**: weekends are busier, and November and December are the strongest months for revenue.

## 3. Derived columns to create
`revenue = price * quantity * (1 - discount/100)`, `month`, `weekday`, `is_holiday`, `age_group`, `price_band`

## 4. Suggested charts
- Line: daily orders / revenue (holiday peaks)
- Bar: avg rating by price band
- Heatmap: age group x category
- Stacked bar: category share by gender
- Box plot: quantity by discount level
- Bar: monthly revenue
