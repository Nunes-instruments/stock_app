from runtime_paths import DATA_DIR, migrate_legacy_data_once

if __name__ == "__main__":
    copied = migrate_legacy_data_once()
    print(f"Persistent data folder: {DATA_DIR}")
    if copied:
        print("Copied legacy data:")
        for item in copied:
            print(f"  - {item}")
    else:
        print("No legacy files needed copying.")
