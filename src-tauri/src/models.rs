use serde::Serialize;

/// A single paste as returned by the pastebin `list` API.
#[derive(Debug, Default, Clone, Serialize)]
pub struct Paste {
    pub key: String,
    pub title: String,
    pub format: String,
    pub date: String,
    pub expire: String,
    pub url: String,
    pub size: String,
    /// 0 = public, 1 = unlisted, 2 = private
    pub private: String,
    pub hits: String,
}
