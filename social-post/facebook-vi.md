Mình vừa phát hiện mình đốt token AI vô tội vạ mà không hề hay biết.

Mỗi tin nhắn gửi tới Claude, OpenCode hay Codex đều kéo theo 95 tool definitions.

Mình chỉ dùng có 35 cái.

60 cái còn lại nằm đó ăn token mỗi request.

28,000 tokens overhead - trước khi mình gõ được chữ nào.

32% budget input, bay.

Mình đào sâu vào data.

50 ngày. 830 sessions. 33,000 tool calls.

Hàng triệu tokens lãng phí.

Cách fix thì đơn giản - bỏ cái không dùng.

Nhưng biết cái nào không dùng mới là vấn đề.

Nên mình build macu.

Một lệnh duy nhất. Nó đọc data sử dụng từ Claude Code, OpenCode, và Codex.

Chỉ ra tool nào dùng nhiều, tool nào không ai gọi.

So sánh before-and-after.

Và đưa ra action plan để AI agent tự thực hiện luôn.

Không cần đọc config file. Không cần audit bằng tay.

Chạy trong AI session, agent lo phần còn lại.

Open source nha.

github.com/minhvoio/macu_minimize-ai-credit-usage

Nếu bạn đang chạy AI coding tools với MCP plugins, khả năng cao bạn cũng đang đốt token giống mình.

30 giây là biết.
