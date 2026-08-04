use std::{fs, path::Path};

use anyhow::{Context, Result, bail};

use crate::assets::atomic_write;

pub fn value(path: &Path, key: &str) -> Result<Option<String>> {
    let contents = fs::read_to_string(path)
        .with_context(|| format!("读取环境文件失败：{}", path.display()))?;
    Ok(contents
        .lines()
        .filter_map(|line| line.split_once('='))
        .filter(|(candidate, _)| *candidate == key)
        .map(|(_, value)| value.to_owned())
        .next_back())
}

pub fn set(path: &Path, key: &str, value: &str) -> Result<()> {
    let contents = fs::read_to_string(path)
        .with_context(|| format!("读取环境文件失败：{}", path.display()))?;
    let output = render(&contents, &[(key, value)])?;
    atomic_write(path, output.as_bytes(), 0o600)
}

pub fn render(contents: &str, values: &[(&str, &str)]) -> Result<String> {
    for (key, value) in values {
        validate_key(key)?;
        validate_value(value)?;
    }

    let additional_capacity: usize = values
        .iter()
        .map(|(key, value)| key.len() + value.len() + 2)
        .sum();
    let mut output = String::with_capacity(contents.len() + additional_capacity);
    let mut found_keys = vec![false; values.len()];
    for line in contents.lines() {
        if let Some(index) = line
            .split_once('=')
            .and_then(|(candidate, _)| values.iter().position(|(key, _)| candidate == *key))
        {
            let (key, value) = values[index];
            output.push_str(key);
            output.push('=');
            output.push_str(value);
            output.push('\n');
            found_keys[index] = true;
        } else {
            output.push_str(line);
            output.push('\n');
        }
    }
    for ((key, value), found_key) in values.iter().zip(found_keys) {
        if !found_key {
            output.push_str(key);
            output.push('=');
            output.push_str(value);
            output.push('\n');
        }
    }
    Ok(output)
}

pub fn validate_value(value: &str) -> Result<()> {
    if value.contains(['\n', '\r', '\0']) {
        bail!("环境变量值不能包含换行或 NUL 字符");
    }
    Ok(())
}

fn validate_key(key: &str) -> Result<()> {
    if key.is_empty()
        || !key
            .chars()
            .all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit() || ch == '_')
    {
        bail!("环境变量名无效");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn updates_only_exact_key_and_rejects_injection() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(".env");
        fs::write(&path, "KEY=old\nKEY_EXTRA=keep\n").unwrap();
        set(&path, "KEY", "new").unwrap();
        assert_eq!(value(&path, "KEY").unwrap().as_deref(), Some("new"));
        assert_eq!(value(&path, "KEY_EXTRA").unwrap().as_deref(), Some("keep"));
        assert!(set(&path, "KEY", "safe\nIMYEMAIL_IMAGE=evil").is_err());
    }

    #[test]
    fn renders_multiple_values_without_writing_partial_configuration() {
        let rendered = render(
            "HOST=example.invalid\nPASSWORD=\nKEEP=value\n",
            &[("HOST", "mail.example.com"), ("PASSWORD", "secret-value")],
        )
        .unwrap();
        assert_eq!(
            rendered,
            "HOST=mail.example.com\nPASSWORD=secret-value\nKEEP=value\n"
        );
        assert!(render("KEY=old\n", &[("KEY", "bad\nINJECTED=1")]).is_err());
    }
}
