-- Remap users 990002-990166 -> 393-557 (offset 989609)
-- Run only while newapi / demo / compliance are stopped.
-- Expected pre-state: MAX(id<990000)=392, MIN(id>=990000)=990002, MAX=990166, COUNT=165

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

START TRANSACTION;

SELECT @low_max := MAX(id) FROM users WHERE id < 990000;
SELECT @high_min := MIN(id), @high_max := MAX(id), @high_cnt := COUNT(*) FROM users WHERE id >= 990000;
SELECT @low_max AS low_max, @high_min AS high_min, @high_max AS high_max, @high_cnt AS high_cnt;

SET @ok := (@low_max = 392 AND @high_min = 990002 AND @high_max = 990166 AND @high_cnt = 165);
SET @dummy := IF(@ok = 1, 0, (SELECT 1/0 FROM dual));

UPDATE tokens SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE logs SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE session_logs SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE conversation_groups SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE quota_data SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE auth_flows SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE checkins SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE external_identity_claims SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE group_exclusives SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE midjourneys SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE oauth_authorization_codes SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE oauth_tokens SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE passkey_credentials SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE redemptions SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE redemptions SET used_user_id = used_user_id - 989609 WHERE used_user_id BETWEEN 990002 AND 990166;
UPDATE subscription_orders SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE subscription_pre_consume_records SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE tasks SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE top_ups SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE two_fa_backup_codes SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE two_fas SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE user_oauth_bindings SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE user_sessions SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;
UPDATE user_subscriptions SET user_id = user_id - 989609 WHERE user_id BETWEEN 990002 AND 990166;

UPDATE users SET inviter_id = inviter_id - 989609 WHERE inviter_id BETWEEN 990002 AND 990166;
UPDATE users SET id = id - 989609 WHERE id BETWEEN 990002 AND 990166;

UPDATE casbin_rule
SET v0 = CONCAT('user:', CAST(SUBSTRING(v0, 6) AS UNSIGNED) - 989609)
WHERE v0 LIKE 'user:%' AND CAST(SUBSTRING(v0, 6) AS UNSIGNED) BETWEEN 990002 AND 990166;

COMMIT;
SET FOREIGN_KEY_CHECKS=1;

-- MySQL 8 InnoDB ignores a plain lower AUTO_INCREMENT; COPY rebuilds the counter.
ALTER TABLE users AUTO_INCREMENT = 558, ALGORITHM=COPY;
