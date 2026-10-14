import numpy as np
import pandas as pd

# Set random seed for reproducibility
np.random.seed(42)

# Number of original rows
n_rows = 10000

# Generate synthetic transaction data
data = {
    'transaction_unique_id': [
        f'TXN-{i:05d}' for i in range(n_rows)
    ],

    'buyer_account_code': np.random.randint(
        1000, 5000, size=n_rows
    ),

    'buyer_age_years': np.random.choice(
        [np.nan, 18, 25, 34, 42, 51, 62, 70],
        size=n_rows,
        p=[0.05, 0.1, 0.2, 0.2, 0.2, 0.15, 0.05, 0.05]
    ),

    'buyer_gender_category': np.random.choice(
        ['Male', 'Female', 'Other', np.nan],
        size=n_rows,
        p=[0.48, 0.48, 0.02, 0.02]
    ),

    'item_product_category': np.random.choice(
        ['Electronics', 'Clothing', 'Home & Kitchen',
         'Beauty', 'Sports'],
        size=n_rows
    ),

    'item_unit_price_usd': np.random.uniform(
        10.0, 500.0, size=n_rows
    ).round(2),

    'item_purchase_quantity': np.random.randint(
        1, 5, size=n_rows
    ),

    'item_discount_applied_pct': np.random.choice(
        [0, 5, 10, 15, 20, 25],
        size=n_rows
    ),

    'transaction_timestamp_str': pd.date_range(
        start='2024-01-01',
        periods=n_rows,
        freq='min'
    ).strftime('%Y-%m-%d %H:%M:%S'),

    'feedback_star_rating': np.random.choice(
        [1, 2, 3, 4, 5, np.nan],
        size=n_rows,
        p=[0.1, 0.1, 0.2, 0.3, 0.2, 0.1]
    ),

    'fulfillment_shipping_fee_usd': np.random.uniform(
        2.0, 25.0, size=n_rows
    ).round(2)
}

# Create the DataFrame
df = pd.DataFrame(data)

# Inject 150 intentional duplicate rows
duplicate_rows = df.sample(
    n=150,
    random_state=42
)

df = pd.concat(
    [df, duplicate_rows],
    ignore_index=True
)

# Display dataset information
print("Dataset Shape:", df.shape)
print("\nFirst 5 rows:")
print(df.head())

print("\nMissing values per column:")
print(df.isnull().sum())

# Save the dataset as a CSV file
filename = "transactions_dataset.csv"

df.to_csv(filename, index=False)

print(f"\nCSV file saved successfully: {filename}")
print(f"Total rows: {len(df)}")
print(f"Total columns: {len(df.columns)}")

# Automatically download the CSV in Google Colab
try:
    from google.colab import files
    files.download(filename)
except ImportError:
    print(
        "\nNot running in Google Colab."
        "\nFind the CSV in your current working directory."
    )
