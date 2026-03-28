const db = require("../config/db");

exports.getUsers = () => {
  return new Promise((resolve, reject) => {
    db.query("SELECT * FROM users", (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
};

exports.createUser = (user) => {

    return new Promise((resolve, reject) => {
  
      const query =
        "INSERT INTO users (name,email,password) VALUES (?,?,?)";
  
      db.query(
        query,
        [user.name, user.email, user.password],
        (err, result) => {
  
          if (err) reject(err);
          else resolve(result);
  
        }
      );
    });
  };

  exports.getUserByEmail = (email) => {

    return new Promise((resolve, reject) => {
  
      const query = "SELECT * FROM users WHERE email = ?";
  
      db.query(query, [email], (err, result) => {
  
        if (err) reject(err);
  
        else resolve(result[0]);
  
      });
  
    });
  
  };

  exports.sendMessage = (data) => {

    return new Promise((resolve, reject) => {
  
      const query =
        "INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)";
  
      db.query(
        query,
        [data.sender_id, data.receiver_id, data.message],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
  
    });
  };

  exports.getMessages = (senderId, receiverId) => {

    return new Promise((resolve, reject) => {
  
      const query = `
        SELECT * FROM messages
        WHERE (sender_id = ? AND receiver_id = ?)
        OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at ASC
      `;
  
      db.query(
        query,
        [senderId, receiverId, receiverId, senderId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
  
    });
  
  };

  exports.updateProfileImage = (userId, imagePath) => {

    return new Promise((resolve, reject) => {

      const query = "UPDATE users SET avatar = ? WHERE id = ?";

      db.query(query, [imagePath, userId], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });

    });

  };

  exports.updateAbout = (userId, about) => {

    return new Promise((resolve, reject) => {
      const query = "UPDATE users SET about = ? WHERE id = ?";

      db.query(query, [about, userId], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

  };

  exports.deleteAccount = (userId, is_delete) => {

    return new Promise((resolve, reject) => {
      const query = "UPDATE users SET is_deleted = ? WHERE id = ? ";

      db.query(query, [is_delete, userId], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

  };

  exports.createStatusPost = (data) => {

    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO status_posts (user_id, media_url, text_content, expires_at)
        VALUES (?, ?, ?, ?)
      `;

      db.query(
        query,
        [data.user_id, data.media_url || null, data.text_content || null, data.expires_at || null],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

  };

  exports.getStatusPosts = (userId = null) => {

    return new Promise((resolve, reject) => {
      const baseQuery = `
        SELECT id, user_id, media_url, text_content, created_at, expires_at
        FROM status_posts
        WHERE expires_at IS NULL OR expires_at > NOW()
      `;

      if (userId === null || userId === undefined) {
        const query = `${baseQuery} ORDER BY created_at DESC`;
        db.query(query, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
        return;
      }

      const query = `${baseQuery} AND user_id = ? ORDER BY created_at DESC`;
      db.query(query, [userId], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

  };

  exports.getStatusViews = (statusId) => {

    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          sv.id,
          sv.status_id,
          sv.viewer_id,
          sv.viewed_at,
          u.name AS viewer_name,
          u.avatar AS viewer_avatar
        FROM status_views sv
        LEFT JOIN users u ON u.id = sv.viewer_id
        WHERE sv.status_id = ?
        ORDER BY sv.viewed_at DESC
      `;

      db.query(query, [statusId], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

  };

  exports.markStatusView = (statusId, viewerId) => {

    return new Promise((resolve, reject) => {
      const query = `
        INSERT IGNORE INTO status_views (status_id, viewer_id)
        VALUES (?, ?)
      `;

      db.query(query, [statusId, viewerId], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

  };

exports.deleteStatus = (statusId, userId) => {

    return new Promise((resolve, reject) => {
      db.beginTransaction((beginErr) => {
        if (beginErr) {
          reject(beginErr);
          return;
        }

        const checkQuery = "SELECT id FROM status_posts WHERE id = ? AND user_id = ? LIMIT 1";
        db.query(checkQuery, [statusId, userId], (checkErr, checkRows) => {
          if (checkErr) {
            return db.rollback(() => reject(checkErr));
          }

          if (!checkRows || !checkRows.length) {
            return db.rollback(() => resolve({ affectedRows: 0 }));
          }

          const deleteViewsQuery = "DELETE FROM status_views WHERE status_id = ?";
          db.query(deleteViewsQuery, [statusId], (deleteViewsErr) => {
            if (deleteViewsErr) {
              return db.rollback(() => reject(deleteViewsErr));
            }

            const deleteStatusQuery = "DELETE FROM status_posts WHERE id = ? AND user_id = ?";
            db.query(deleteStatusQuery, [statusId, userId], (deleteStatusErr, deleteStatusResult) => {
              if (deleteStatusErr) {
                return db.rollback(() => reject(deleteStatusErr));
              }

              db.commit((commitErr) => {
                if (commitErr) {
                  return db.rollback(() => reject(commitErr));
                }

                resolve(deleteStatusResult);
              });
            });
          });
        });
      });
    });

  };

  exports.createPayment = (data) => {

    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO payments (user_id, amount, status, transaction_id)
        VALUES (?, ?, ?, ?)
      `;

      db.query(
        query,
        [data.user_id, data.amount, data.status, data.transaction_id],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

  };

  exports.getPremiumStatus = (userId) => {

    return new Promise((resolve, reject) => {
      const query = `
        SELECT id
        FROM payments
        WHERE user_id = ? AND status = 'success'
        ORDER BY created_at DESC
        LIMIT 1
      `;

      db.query(query, [userId], (err, result) => {
        if (err) reject(err);
        else resolve(result && result.length > 0);
      });
    });

  };
