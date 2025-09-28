// pricing.js

// -------------------------------------------------------------------
// 1. 토스페이먼츠 SDK 로더 (Toss Payments SDK Loader)
// 이 부분은 라이브러리를 불러오는 역할만 하므로 그대로 둡니다.
// -------------------------------------------------------------------
var q = "https://js.tosspayments.com/v2/standard";

function T(e, t) {
  if (!(e instanceof t)) throw new TypeError("Cannot call a class as a function")
}
// ... (SDK 로더의 나머지 코드는 변경 없이 그대로 둡니다) ...
function R(e, t) {
  if (typeof t != "function" && t !== null) throw new TypeError("Super expression must either be null or a function");
  e.prototype = Object.create(t && t.prototype, {
    constructor: {
      value: e,
      writable: !0,
      configurable: !0
    }
  }), t && v(e, t)
}

function m(e) {
  return m = Object.setPrototypeOf ? Object.getPrototypeOf : function(c) {
    return c.__proto__ || Object.getPrototypeOf(c)
  }, m(e)
}

function v(e, t) {
  return v = Object.setPrototypeOf || function(o, r) {
    return o.__proto__ = r, o
  }, v(e, t)
}

function C() {
  if (typeof Reflect > "u" || !Reflect.construct || Reflect.construct.sham) return !1;
  if (typeof Proxy == "function") return !0;
  try {
    return Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {})), !0
  } catch {
    return !1
  }
}

function _(e, t, c) {
  return C() ? _ = Reflect.construct : _ = function(r, s, u) {
    var d = [null];
    d.push.apply(d, s);
    var l = Function.bind.apply(r, d),
      p = new l;
    return u && v(p, u.prototype), p
  }, _.apply(null, arguments)
}

function A(e) {
  return Function.toString.call(e).indexOf("[native code]") !== -1
}

function g(e) {
  var t = typeof Map == "function" ? new Map : void 0;
  return g = function(o) {
    if (o === null || !A(o)) return o;
    if (typeof o != "function") throw new TypeError("Super expression must either be null or a function");
    if (typeof t < "u") {
      if (t.has(o)) return t.get(o);
      t.set(o, r)
    }

    function r() {
      return _(o, arguments, m(this).constructor)
    }
    return r.prototype = Object.create(o.prototype, {
      constructor: {
        value: r,
        enumerable: !1,
        writable: !0,
        configurable: !0
      }
    }), v(r, o)
  }, g(e)
}

function K(e) {
  if (e === void 0) throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
  return e
}

function F(e, t) {
  if (t && (typeof t == "object" || typeof t == "function")) return t;
  if (t !== void 0) throw new TypeError("Derived constructors may only return object or undefined");
  return K(e)
}

function j(e) {
  var t = C();
  return function() {
    var o = m(e),
      r;
    if (t) {
      var s = m(this).constructor;
      r = Reflect.construct(o, arguments, s)
    } else r = o.apply(this, arguments);
    return F(this, r)
  }
}
var h = null;

function x(e, t) {
  var c = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
  if (h != null) return h;
  var o = new Promise(function(r, s) {
    try {
      var u = function() {
          b(t) != null ? r(b(t)) : s(new I(t))
        },
        d = function() {
          s(new U(e))
        };
      if (typeof window > "u" || typeof document > "u") return r(null);
      if (b(t) != null) return r(b(t));
      var l = document.querySelector('script[src="'.concat(e, '"]'));
      if (l != null) {
        var p;
        l.removeEventListener("load", u), l.removeEventListener("error", d), (p = l.parentElement) === null || p === void 0 || p.removeChild(l)
      }
      var f = document.createElement("script");
      f.src = e, f.addEventListener("load", u), f.addEventListener("error", d), c.priority != null && (f.fetchPriority = c.priority), document.head.appendChild(f)
    } catch (y) {
      s(y);
      return
    }
  });
  return h = o.catch(function(r) {
    return h = null, Promise.reject(r)
  }), h
}

function b(e) {
  return window[e]
}
var I = (function(e) {
  R(c, e);
  var t = j(c);

  function c(o) {
    var r;
    return T(this, c), r = t.call(this, "[TossPayments SDK] ".concat(o, " is not available")), r.name = "NamespaceNotAvailableError", r
  }
  return c
})(g(Error)),
U = (function(e) {
  R(c, e);
  var t = j(c);

  function c(o) {
    var r;
    return T(this, c), r = t.call(this, "[TossPayments SDK] Failed to load script: [".concat(o, "]")), r.name = "ScriptLoadFailedError", r
  }
  return c
})(g(Error));

function $(e) {
  var t = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {},
    c = t.src,
    o = c === void 0 ? q : c;
  return typeof window > "u" ? Promise.resolve({}) : x(o, "TossPayments").then(function(r) {
    return r(e)
  })
}


// -------------------------------------------------------------------
// 2. 애플리케이션 로직 (Application Logic)
// ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
// DOMContentLoaded 래퍼를 제거하여 코드가 바로 실행되도록 합니다.
// ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
const e = typeof window < "u" && window.TOSS_CLIENT_KEY ? window.TOSS_CLIENT_KEY : "live_gck_ex6BJGQOVDJZMkxXRRMn8W4w2zNb",
  t = n => document.querySelector(n),
  c = n => Array.from(document.querySelectorAll(n)),
  o = t("#mBtn"),
  r = t("#yBtn"),
  s = c(".plan"),
  u = t("#subscribeBtn"),
  d = t("#agree"),
  l = t("#chosen"),
  p = c(".methods .chip");
let f = "month",
  y = null,
  S = "toss",
  L = !1;
const P = n => Number(n).toLocaleString("ko-KR");

// NodeList가 비어있지 않을 때만 forEach를 실행하도록 방어 코드 추가
if (p && p.length > 0) {
    p.forEach(n => {
        n.addEventListener("click", () => {
            p.forEach(i => i.classList.remove("active")), n.classList.add("active"), S = n.dataset.method || "toss"
        })
    });
}
if (s && s.length > 0) {
    s.forEach(n => {
        n.querySelector(".select-btn")?.addEventListener("click", () => {
            s.forEach(a => a.classList.remove("selected")), n.classList.add("selected"), O()
        })
    });
}
// [o, r]은 #mBtn, #yBtn이므로 null일 수 있습니다. null 체크 추가
if (o && r) {
    [o, r].forEach(n => {
        n.addEventListener("click", () => {
            const i = n === o;
            f = i ? "month" : "year", o.classList.toggle("active", i), r.classList.toggle("active", !i), s.forEach(a => {
                const w = a.querySelector(".price .num"),
                    N = a.querySelector(".price small");
                if (w && N) {
                    const B = i ? a.dataset.month : a.dataset.year;
                    w.textContent = P(B), N.textContent = i ? "/ 월" : "/ 년"
                }
            }), O()
        })
    });
}

function O() {
  const n = t(".plan.selected");
  if (n) {
    const i = n.dataset.plan,
      a = Number(f === "year" ? n.dataset.year : n.dataset.month);
    y = {
      id: i,
      price: a
    };
    const w = n.querySelector("h3")?.textContent.trim() || i;
    l.textContent = `${w} - ${P(a)}원 / ${f==="year"?"년":"월"}`
  } else y = null, l.textContent = "아직 선택하지 않았어요.";
  E()
}

if (d) {
    d.addEventListener("change", E);
}

function E() {
  if (u) {
    u.disabled = !(d && d.checked && y);
  }
}

async function k(n) {
  try {
    await (await $("test_ck_0RnYX2w532okP2MNZRyPVNeyqApQ")).payment({
      customerKey: n.customerKey
    }).requestBillingAuth({
      method: "CARD",
      successUrl: n.successUrl,
      failUrl: n.failUrl
    })
  } catch (i) {
    console.error("Toss billing open error:", i), i?.code === "USER_CANCEL" ? alert("결제가 취소되었습니다.") : alert(`결제창 호출 중 오류가 발생했습니다: ${i?.message||"알 수 없는 오류"}`)
  }
}

if (u) {
    u.addEventListener("click", async () => {
        if (!(u.disabled || L)) {
            if (S !== "toss") {
                alert("지금은 토스 간편결제만 지원합니다.");
                return
            }
            L = !0, u.disabled = !0;
            try {
                const n = await fetch("/api/billing/start", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        plan: y?.id,
                        cycle: f
                    })
                });
                if (n.status === 401) {
                    alert("로그인 후 이용해주세요."), location.href = "/login.html?next=/pricing.html";
                    return
                }
                if (!n.ok) {
                    const a = await n.text().catch(() => n.statusText);
                    throw new Error(a || "초기화 실패")
                }
                const i = await n.json();
                await k(i)
            } catch (n) {
                console.error(n), alert("결제를 시작할 수 없습니다. 잠시 후 다시 시도해주세요.")
            } finally {
                L = !1, E()
            }
        }
    });
}

// 페이지 로드 시 버튼 상태 초기화
E();