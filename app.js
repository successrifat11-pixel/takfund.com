// ============================================================
// TaskFund — ইউজার অ্যাপ লজিক
// ============================================================

let TASKS = []; // এখন Firestore এর 'tasks' কালেকশন থেকে লোড হয় (অ্যাডমিন প্যানেল থেকে ম্যানেজ করা যায়)

let currentUid = null;
let currentUserData = null;
let taskSubs = {}; // taskId -> {status, screenshotUrl}
let currentTab = "home";
let withdrawMethod = "bKash";
let currentModalTaskId = null;

let currentMinWithdraw = MIN_WITHDRAW; // অ্যাডমিন প্যানেলের সেটিংস থেকে বদলানো গেলে এটা আপডেট হবে

document.getElementById("feeAmount1").textContent = ACTIVATION_FEE;
document.getElementById("feeAmount2").textContent = ACTIVATION_FEE;
document.getElementById("minWithdrawLabel").textContent = MIN_WITHDRAW;
document.getElementById("receiveNumber").textContent = PAYMENT_RECEIVE_NUMBER;

function genUserId() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `TF-${n}`;
}

const BRAND_COLORS = {
  Facebook: "#1877F2",
  YouTube: "#FF0000",
  Instagram: "#C13584",
  TikTok: "#000000",
  Twitter: "#1DA1F2",
  X: "#000000",
  Telegram: "#229ED9",
  WhatsApp: "#25D366",
};
const BRAND_EMOJI = {
  Facebook: "f",
  YouTube: "▶",
  Instagram: "◎",
  TikTok: "♪",
  Twitter: "𝕏",
  X: "𝕏",
  Telegram: "✈",
  WhatsApp: "☎",
};
function brandColor(brand) { return BRAND_COLORS[brand] || "#96691F"; }
function brandEmoji(brand) { return BRAND_EMOJI[brand] || "★"; }

// ---------- Auth (মোবাইল নম্বর + পাসওয়ার্ড) ----------
function phoneToEmail(phone) {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@taskfund.local`;
}

let authMode = "signup";
function setAuthTab(mode) {
  authMode = mode;
  document.getElementById("authTabSignup").classList.toggle("active", mode === "signup");
  document.getElementById("authTabLogin").classList.toggle("active", mode === "login");
  document.getElementById("authPasswordConfirm").classList.toggle("hidden", mode === "login");
  document.getElementById("authSubmitBtn").textContent = mode === "signup" ? "অ্যাকাউন্ট বানান" : "লগইন করুন";
  document.getElementById("authError").classList.add("hidden");
}

document.getElementById("authSubmitBtn").addEventListener("click", async () => {
  const phone = document.getElementById("authPhone").value.trim();
  const password = document.getElementById("authPassword").value;
  const confirmPw = document.getElementById("authPasswordConfirm").value;
  const errBox = document.getElementById("authError");
  const btn = document.getElementById("authSubmitBtn");
  errBox.classList.add("hidden");

  if (!phone || !password) {
    errBox.textContent = "মোবাইল নম্বর ও পাসওয়ার্ড দিন।";
    errBox.classList.remove("hidden");
    return;
  }
  if (password.length < 6) {
    errBox.textContent = "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।";
    errBox.classList.remove("hidden");
    return;
  }

  const email = phoneToEmail(phone);
  btn.disabled = true;

  try {
    if (authMode === "signup") {
      if (password !== confirmPw) {
        errBox.textContent = "দুটো পাসওয়ার্ড মিলছে না।";
        errBox.classList.remove("hidden");
        btn.disabled = false;
        return;
      }
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await db.collection("users").doc(cred.user.uid).set({
        userId: genUserId(),
        phone,
        status: "locked",
        balance: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await auth.signInWithEmailAndPassword(email, password);
    }
  } catch (err) {
    let msg = err.message;
    if (err.code === "auth/email-already-in-use") msg = "এই নম্বর দিয়ে আগেই অ্যাকাউন্ট আছে — 'লগইন করুন' এ গিয়ে ঢুকুন।";
    if (err.code === "auth/wrong-password") msg = "পাসওয়ার্ড ভুল হয়েছে।";
    if (err.code === "auth/user-not-found") msg = "এই নম্বরে কোনো অ্যাকাউন্ট পাওয়া যায়নি — 'নতুন অ্যাকাউন্ট' এ গিয়ে বানান।";
    if (err.code === "auth/invalid-email") msg = "সঠিক মোবাইল নম্বর দিন।";
    errBox.textContent = msg;
    errBox.classList.remove("hidden");
  } finally {
    btn.disabled = false;
  }
});

function userLogout() {
  auth.signOut();
}

auth.onAuthStateChanged(async (user) => {
  const authScreen = document.getElementById("authScreen");
  const activationScreen = document.getElementById("activationScreen");
  const mainApp = document.getElementById("mainApp");

  if (!user) {
    authScreen.classList.remove("hidden");
    activationScreen.classList.add("hidden");
    mainApp.classList.add("hidden");
    return;
  }

  authScreen.classList.add("hidden");
  currentUid = user.uid;
  await ensureUserDoc(user.uid);
  listenSettings();
  listenUserDoc(user.uid);
  listenTasks();
  listenTaskSubmissions(user.uid);
  listenTransactions(user.uid);
});

async function ensureUserDoc(uid) {
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      userId: genUserId(),
      status: "locked", // locked | pending | active
      balance: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
}

function listenUserDoc(uid) {
  db.collection("users").doc(uid).onSnapshot((snap) => {
    if (!snap.exists) return;
    currentUserData = snap.data();
    renderUserState();
  });
}

function renderUserState() {
  const status = currentUserData.status;
  document.getElementById("uidLocked").textContent = currentUserData.userId;
  document.getElementById("uidActive").textContent = currentUserData.userId;
  document.getElementById("referralLinkText").textContent = `taskfund.app/r/${currentUserData.userId}`;
  document.getElementById("balanceAmount").textContent = currentUserData.balance || 0;

  const activationScreen = document.getElementById("activationScreen");
  const mainApp = document.getElementById("mainApp");

  if (status === "active") {
    activationScreen.classList.add("hidden");
    mainApp.classList.remove("hidden");
  } else {
    mainApp.classList.add("hidden");
    activationScreen.classList.remove("hidden");
    document.getElementById("stateLocked").classList.toggle("hidden", status !== "locked");
    document.getElementById("statePending").classList.toggle("hidden", status !== "pending");
  }

  updateWithdrawButton();
}

// ---------- অ্যাক্টিভেশন ----------
const senderNumberInput = document.getElementById("senderNumber");
const trxIdInput = document.getElementById("trxId");
const submitActivationBtn = document.getElementById("submitActivationBtn");

function checkActivationForm() {
  submitActivationBtn.disabled = !(senderNumberInput.value.trim() && trxIdInput.value.trim());
}
senderNumberInput.addEventListener("input", checkActivationForm);
trxIdInput.addEventListener("input", checkActivationForm);

submitActivationBtn.addEventListener("click", async () => {
  const senderNumber = senderNumberInput.value.trim();
  const trxId = trxIdInput.value.trim();
  if (!senderNumber || !trxId) return;

  submitActivationBtn.disabled = true;
  submitActivationBtn.textContent = "পাঠানো হচ্ছে...";
  const errBox = document.getElementById("activationError");
  errBox.classList.add("hidden");

  try {
    await db.collection("activationRequests").add({
      uid: currentUid,
      userId: currentUserData.userId,
      senderNumber,
      trxId,
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection("users").doc(currentUid).update({ status: "pending" });
    document.getElementById("pendingSenderNumber").textContent = senderNumber;
    document.getElementById("pendingTrxId").textContent = trxId;
  } catch (err) {
    console.error(err);
    errBox.textContent = "জমা দিতে সমস্যা হয়েছে: " + err.message;
    errBox.classList.remove("hidden");
    submitActivationBtn.disabled = false;
    submitActivationBtn.textContent = "যাচাইয়ের জন্য জমা দিন";
  }
});

// ---------- সার্ভিস/টাস্ক তালিকা (Firestore থেকে, অ্যাডমিন প্যানেল ম্যানেজ করে) ----------
function listenTasks() {
  db.collection("tasks")
    .where("active", "==", true)
    .onSnapshot(
      (snap) => {
        TASKS = [];
        snap.forEach((doc) => {
          const d = doc.data();
          TASKS.push({
            id: doc.id,
            title: d.title,
            brand: d.brand,
            reward: d.reward,
            targetUrl: d.targetUrl || "",
            instructions: d.instructions || "",
            color: brandColor(d.brand),
            emoji: brandEmoji(d.brand),
          });
        });
        renderTasks();
      },
      (err) => {
        console.error("Tasks listen error:", err);
        document.getElementById("taskListAll").innerHTML =
          `<p class="empty-note" style="color:#B3261E;">সার্ভিস তালিকা লোড করতে সমস্যা হয়েছে।</p>`;
      }
    );
}

// ---------- টাস্ক জমা ----------
function listenTaskSubmissions(uid) {
  db.collection("taskSubmissions").where("uid", "==", uid).onSnapshot((snap) => {
    taskSubs = {};
    snap.forEach((doc) => {
      const d = doc.data();
      taskSubs[d.taskId] = { status: d.status, proofText: d.proofText };
    });
    renderTasks();
    if (currentModalTaskId) {
      const t = TASKS.find((x) => x.id === currentModalTaskId);
      if (t) renderModalUploadArea(t);
    }
  });
}

function taskRowHtml(task) {
  const sub = taskSubs[task.id];
  const state = sub ? sub.status : "none";

  let badgeHtml = "";
  if (state === "none") {
    badgeHtml = `<span class="btn btn-gold" style="pointer-events:none;">দেখুন</span>`;
  } else if (state === "pending") {
    badgeHtml = `<span class="status-pending">⏳ রিভিউ চলছে</span>`;
  } else if (state === "approved") {
    badgeHtml = `<span class="status-approved">✓ অনুমোদিত</span>`;
  } else if (state === "rejected") {
    badgeHtml = `<span class="status-pending" style="color:#B3261E;background:#FBEAEA;">বাতিল হয়েছে</span>`;
  }

  return `
    <div class="card task-card-clickable" style="background:${state === 'approved' ? 'var(--card)' : 'white'}" onclick="openTaskModal('${task.id}')">
      <div class="task-row">
        <div class="task-left">
          <div class="task-icon" style="background:${task.color}22;color:${task.color}">${task.emoji}</div>
          <div>
            <p class="task-title">${task.title}</p>
            <p class="task-sub">${task.brand} • ৳${task.reward} পুরস্কার</p>
          </div>
        </div>
        ${badgeHtml}
      </div>
    </div>`;
}

function renderTasks() {
  if (TASKS.length === 0) {
    document.getElementById("taskListHome").innerHTML = `<p class="empty-note">এখনো কোনো সার্ভিস যোগ করা হয়নি।</p>`;
    document.getElementById("taskListAll").innerHTML = `<p class="empty-note">এখনো কোনো সার্ভিস যোগ করা হয়নি।</p>`;
    document.getElementById("doneCountHome").textContent = 0;
    document.getElementById("totalTasksHome").textContent = 0;
    return;
  }
  document.getElementById("taskListHome").innerHTML = TASKS.slice(0, 3).map(taskRowHtml).join("");
  document.getElementById("taskListAll").innerHTML = TASKS.map(taskRowHtml).join("");

  const doneCount = Object.values(taskSubs).filter((s) => s.status === "approved").length;
  document.getElementById("doneCountHome").textContent = doneCount;
  document.getElementById("totalTasksHome").textContent = TASKS.length;
}

// ---------- টাস্ক ডিটেইল মোডাল ----------
function openTaskModal(taskId) {
  const task = TASKS.find((t) => t.id === taskId);
  if (!task) return;
  currentModalTaskId = taskId;

  document.getElementById("modalTaskTitle").textContent = task.title;
  document.getElementById("modalTaskReward").textContent = `${task.brand} • ৳${task.reward} পুরস্কার`;
  document.getElementById("modalTaskInstructions").textContent =
    task.instructions || "এই সার্ভিসের জন্য কোনো নির্দেশনা যোগ করা হয়নি।";

  const linkEl = document.getElementById("modalTaskLink");
  if (task.targetUrl) {
    linkEl.href = task.targetUrl;
    linkEl.classList.remove("hidden");
  } else {
    linkEl.classList.add("hidden");
  }

  renderModalUploadArea(task);
  document.getElementById("taskModal").classList.remove("hidden");
}

function closeTaskModal() {
  document.getElementById("taskModal").classList.add("hidden");
  currentModalTaskId = null;
}

function renderModalUploadArea(task) {
  const sub = taskSubs[task.id];
  const state = sub ? sub.status : "none";
  const el = document.getElementById("modalUploadArea");

  if (state === "none") {
    el.innerHTML = `
      <input type="text" id="proofInput_${task.id}" placeholder="যে আইডি/অ্যাকাউন্ট দিয়ে কাজটি করেছেন তার নাম লিখুন" />
      <button class="btn btn-gold btn-block" onclick="submitTaskProof('${task.id}')">জমা দিন</button>`;
  } else if (state === "pending") {
    el.innerHTML = `
      <div class="status-pending" style="justify-content:center;width:100%;box-sizing:border-box;">⏳ রিভিউ চলছে</div>
      ${sub.proofText ? `<div class="card muted-bg" style="margin-top:10px;"><b>জমা দেওয়া নাম/আইডি:</b> ${escapeHtml(sub.proofText)}</div>` : ""}`;
  } else if (state === "approved") {
    el.innerHTML = `<div class="status-approved" style="justify-content:center;width:100%;box-sizing:border-box;">✓ অনুমোদিত — ৳${task.reward} ব্যালেন্সে যোগ হয়েছে</div>`;
  } else if (state === "rejected") {
    el.innerHTML = `
      <div class="status-pending" style="justify-content:center;width:100%;color:#B3261E;background:#FBEAEA;box-sizing:border-box;margin-bottom:10px;">বাতিল হয়েছে — আবার চেষ্টা করুন</div>
      <input type="text" id="proofInput_${task.id}" placeholder="যে আইডি/অ্যাকাউন্ট দিয়ে কাজটি করেছেন তার নাম লিখুন" />
      <button class="btn btn-gold btn-block" onclick="submitTaskProof('${task.id}')">আবার জমা দিন</button>`;
  }
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

async function submitTaskProof(taskId) {
  const input = document.getElementById(`proofInput_${taskId}`);
  const proofText = input ? input.value.trim() : "";
  if (!proofText) {
    alert("যে আইডি/অ্যাকাউন্ট দিয়ে কাজটি করেছেন তার নাম লিখুন।");
    return;
  }
  const task = TASKS.find((t) => t.id === taskId);

  try {
    await db.collection("taskSubmissions").add({
      uid: currentUid,
      userId: currentUserData.userId,
      taskId,
      taskTitle: task.title,
      reward: task.reward,
      proofText,
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(err);
    alert("জমা দিতে সমস্যা হয়েছে: " + err.message);
  }
}

// ---------- লেনদেনের হিসাব ----------
function listenTransactions(uid) {
  db.collection("transactions")
    .where("uid", "==", uid)
    .onSnapshot(
      (snap) => {
        const rows = [];
        snap.forEach((doc) => rows.push(doc.data()));
        rows.sort((a, b) => (a.createdAt && b.createdAt ? b.createdAt.toMillis() - a.createdAt.toMillis() : 0));
        renderLedger(rows);
      },
      (err) => {
        console.error("Ledger listen error:", err);
        document.getElementById("ledgerList").innerHTML =
          `<p class="empty-note" style="color:#B3261E;text-align:left;padding:0;">লোড করতে সমস্যা: ${err.message}</p>`;
      }
    );
}

function renderLedger(rows) {
  const el = document.getElementById("ledgerList");
  if (rows.length === 0) {
    el.innerHTML = `<p class="empty-note" style="text-align:left;padding:0;">এখনো কোনো লেনদেন হয়নি।</p>`;
    return;
  }
  el.innerHTML = rows
    .map(
      (r) => `
      <div class="card muted-bg" style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;">${r.label}</span>
        <span style="font-size:13px;font-weight:600;color:${r.type === "in" ? "var(--green)" : "var(--red)"}">
          ${r.type === "in" ? "+" : "-"}৳${r.amount}
        </span>
      </div>`
    )
    .join("");
}

function calcWithdrawFee(amount) {
  if (amount >= 200) return 25;
  if (amount >= 100) return 10;
  if (amount >= 70) return 7;
  if (amount >= 50) return 5;
  return 0;
}

// ---------- অ্যাডমিন-এডিটেবল সেটিংস (bKash/নগদ নম্বর) ----------
function listenSettings() {
  db.collection("settings")
    .doc("config")
    .onSnapshot(
      (snap) => {
        const d = snap.exists ? snap.data() : {};
        const number = d.paymentNumber || PAYMENT_RECEIVE_NUMBER;
        document.getElementById("receiveNumber").textContent = number;

        currentMinWithdraw = d.minWithdraw ? Number(d.minWithdraw) : MIN_WITHDRAW;
        document.getElementById("minWithdrawLabel").textContent = currentMinWithdraw;
        updateWithdrawButton();
      },
      (err) => console.error("Settings listen error:", err)
    );
}

// ---------- ওয়ালেট / উইথড্র্র ----------
function setWithdrawMethod(m) {
  withdrawMethod = m;
  document.getElementById("methodBkash").classList.toggle("active", m === "bKash");
  document.getElementById("methodNagad").classList.toggle("active", m === "নগদ");
}

const withdrawNumberInput = document.getElementById("withdrawNumber");
const withdrawBtn = document.getElementById("withdrawBtn");

function updateWithdrawButton() {
  const balance = (currentUserData && currentUserData.balance) || 0;
  const hint = document.getElementById("withdrawHint");
  const feeInfo = document.getElementById("withdrawFeeInfo");

  if (balance < currentMinWithdraw) {
    hint.textContent = `ন্যূনতম ৳${currentMinWithdraw} ব্যালেন্স হলে উইথড্র্র করা যাবে।`;
    feeInfo.innerHTML = "";
  } else {
    hint.textContent = "";
    const fee = calcWithdrawFee(balance);
    const payout = balance - fee;
    feeInfo.innerHTML = `
      <div class="card muted-bg">
        <div class="kv-row"><span>চার্জ</span><span>৳${fee}</span></div>
        <div class="kv-row"><span>হাতে পাবেন</span><span>৳${payout}</span></div>
      </div>`;
  }
  withdrawBtn.textContent = `৳${balance} উইথড্র্র অনুরোধ পাঠান`;
  checkWithdrawForm();
}

function checkWithdrawForm() {
  const balance = (currentUserData && currentUserData.balance) || 0;
  withdrawBtn.disabled = !(withdrawNumberInput.value.trim() && balance >= currentMinWithdraw);
}
withdrawNumberInput.addEventListener("input", checkWithdrawForm);

withdrawBtn.addEventListener("click", async () => {
  const number = withdrawNumberInput.value.trim();
  const balance = (currentUserData && currentUserData.balance) || 0;
  if (!number || balance < currentMinWithdraw) return;

  const fee = calcWithdrawFee(balance);
  const payout = balance - fee;

  withdrawBtn.disabled = true;
  try {
    await db.collection("withdrawals").add({
      uid: currentUid,
      userId: currentUserData.userId,
      method: withdrawMethod,
      number,
      amount: balance,
      fee,
      payout,
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    const msg = document.getElementById("withdrawMsg");
    msg.textContent = `অনুরোধ গৃহীত হয়েছে — চার্জ ৳${fee} বাদে ৳${payout} পাবেন। অ্যাডমিন যাচাই করে পাঠাবে।`;
    msg.classList.remove("hidden");
    withdrawNumberInput.value = "";
  } catch (err) {
    alert("উইথড্র্র অনুরোধ পাঠাতে সমস্যা হয়েছে: " + err.message);
  } finally {
    checkWithdrawForm();
  }
});

// ---------- ট্যাব সুইচ ----------
function switchTab(tab) {
  currentTab = tab;
  ["home", "tasks", "referral", "wallet"].forEach((t) => {
    document.getElementById("tab" + capitalize(t)).classList.toggle("hidden", t !== tab);
  });
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function copyReferralLink() {
  const text = document.getElementById("referralLinkText").textContent;
  navigator.clipboard.writeText(text).catch(() => {});
}
