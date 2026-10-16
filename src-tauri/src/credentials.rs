use keyring::Entry;

const KEYCHAIN_SERVICE: &str = "ai.summarizebot.desktop";
const KEYCHAIN_USER: &str = "openrouter";

fn openrouter_entry() -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER).map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn get_openrouter_key() -> Result<Option<String>, String> {
    match openrouter_entry()?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command(async)]
pub fn set_openrouter_key(key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("empty_key".to_string());
    }
    openrouter_entry()?
        .set_password(key)
        .map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn delete_openrouter_key() -> Result<(), String> {
    match openrouter_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_set_openrouter_key_rejects_empty_and_whitespace_before_touching_keychain() {
        assert_eq!(set_openrouter_key(String::new()), Err("empty_key".to_string()));
        assert_eq!(
            set_openrouter_key(" \t\n ".to_string()),
            Err("empty_key".to_string())
        );
    }
}
