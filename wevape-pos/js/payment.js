const PaymentModule = (() => {
  const CLIENT_KEY = "test_ck_LlDJaYngroGLoLM16J5nrezGdRpX";
  const SECRET_KEY = "test_sk_yZqmkKeP8g7d9gwkN5JY8bQRxB9l";
  const PENDING_PREFIX = "wevape_pending_order_";

  let tossPayments = null;

  function initTossPayments() {
    if (!tossPayments) tossPayments = TossPayments(CLIENT_KEY);
    return tossPayments;
  }

  // pendingOrderData가 주어지면 결제창 호출 직전에 sessionStorage에 저장해
  // successUrl 리다이렉트 후에도 주문 등록에 필요한 정보를 복원할 수 있게 한다.
  async function requestPayment(amount, orderName, customerName, pendingOrderData) {
    const tp = initTossPayments();
    const payment = tp.payment({ customerKey: TossPayments.ANONYMOUS });
    const orderId = "wevape-" + Date.now() + Math.random().toString(36).slice(2, 8);

    if (pendingOrderData) {
      sessionStorage.setItem(PENDING_PREFIX + orderId, JSON.stringify(pendingOrderData));
    }

    const baseUrl = window.location.origin + window.location.pathname;

    await payment.requestPayment({
      method: "CARD",
      amount: { currency: "KRW", value: amount },
      orderId,
      orderName,
      customerName,
      successUrl: baseUrl + "?payment=success",
      failUrl: baseUrl + "?payment=fail",
      card: { useEscrow: false, flatRate: false, useCardPoint: false }
    });
  }

  async function confirmPayment(paymentKey, orderId, amount) {
    const res = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(SECRET_KEY + ":"),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ paymentKey, orderId, amount })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "결제 승인에 실패했습니다.");
    return data;
  }

  function takePendingOrder(orderId) {
    const key = PENDING_PREFIX + orderId;
    const raw = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    return raw ? JSON.parse(raw) : null;
  }

  // URL에 ?payment=success|fail 파라미터가 있으면 토스 결제 결과를 파싱하고
  // 처리에 사용한 파라미터를 history.replaceState로 제거한다.
  function consumePaymentResultFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("payment");
    if (!status) return null;

    const result = {
      status,
      paymentKey: params.get("paymentKey"),
      orderId: params.get("orderId"),
      amount: params.get("amount") ? parseInt(params.get("amount"), 10) : null,
      code: params.get("code"),
      message: params.get("message")
    };

    const url = new URL(window.location.href);
    ["payment", "paymentKey", "orderId", "amount", "code", "message"].forEach(k => url.searchParams.delete(k));
    history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);

    return result;
  }

  return { initTossPayments, requestPayment, confirmPayment, takePendingOrder, consumePaymentResultFromUrl };
})();
