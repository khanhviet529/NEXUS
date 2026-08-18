import { Agent } from 'node:http';
import http from 'node:http';

/**
 * F-26 — tắt keep-alive của http.globalAgent trong TEST.
 *
 * Node ≥19 bật keep-alive mặc định cho globalAgent (idle 5s phía client);
 * supertest/superagent không truyền agent riêng nên TÁI DÙNG socket giữa các
 * request. Server Node cũng có keepAliveTimeout 5s — client rút socket từ pool
 * đúng lúc server FIN là `read ECONNRESET` (race kinh điển, có tài liệu).
 *
 * Máy dev nhanh không bao giờ chạm ngưỡng 5s; runner CI 2-core thì khoảng
 * nghỉ giữa request vượt 5s NHIỀU LẦN mỗi lượt → job "Backend + kiến trúc"
 * đỏ đều từ khi suite phình to (CI #74-#76), bung ở test 20-request-song-song
 * inventory #22. Tắt keep-alive phía CLIENT test: mỗi request một socket —
 * đúng ngữ nghĩa test, không đụng cấu hình server production.
 */
http.globalAgent = new Agent({ keepAlive: false });
