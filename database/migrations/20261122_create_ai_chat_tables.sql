-- CHERI AI customer support conversations
CREATE TABLE IF NOT EXISTS chat_conversations (
    id CHAR(36) NOT NULL,
    user_id BIGINT UNSIGNED NULL,
    guest_session_hash CHAR(64) NULL,
    status ENUM('ai_active','waiting_admin','admin_active','closed') NOT NULL DEFAULT 'ai_active',
    assigned_admin_id BIGINT UNSIGNED NULL,
    subject VARCHAR(180) NULL,
    last_message_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_chat_user_last (user_id, last_message_at),
    KEY idx_chat_guest_last (guest_session_hash, last_message_at),
    KEY idx_chat_status_last (status, last_message_at),
    KEY idx_chat_admin (assigned_admin_id),
    CONSTRAINT fk_chat_conversations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_chat_conversations_admin FOREIGN KEY (assigned_admin_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_chat_conversation_owner CHECK (
        (user_id IS NOT NULL AND guest_session_hash IS NULL) OR
        (user_id IS NULL AND guest_session_hash IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    conversation_id CHAR(36) NOT NULL,
    sender_type ENUM('customer','assistant','admin','system') NOT NULL,
    sender_user_id BIGINT UNSIGNED NULL,
    content TEXT NOT NULL,
    metadata JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_chat_messages_conversation (conversation_id, id),
    CONSTRAINT fk_chat_messages_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_messages_sender FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
