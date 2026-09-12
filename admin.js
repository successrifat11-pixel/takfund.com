// ============================================================
// TaskFund — অ্যাডমিন প্যানেল লজিক
// ============================================================

let adminTab = "activations";

document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errBox = document.getElementById("loginError");
  errBox.classList.add("hidden");
  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    errBox.textContent = "লগইন ব্যর্থ: " + err.message;
    errBox.classList.remove("hidden");
  }
});

function logout() {
  auth.signOut();
}

auth.onAuthStateChanged((user) => {
  const loginBox = document.getElementById("loginBox");
  const dashboard = document.getElementById("adminDashboard");

  if (user && user.email === ADMIN_EMAIL) {
    loginBox.classList.add("hidden");
    dashboard.classList.remove("hidden");
    startListeners();
  } else {
    if (user && user.email !== ADMIN_EMAIL) {
      auth.signOut();
      const errBox = document.getElementById("loginError");
      errBox.textContent = "এই ইমেইল দিয়ে অ্যাডমিন প্যানেলে ঢোকার অনুমতি নেই।";
      errBox.classList.remove("hidden");
    }
    loginBox.classList.remove("hidden");
    dashboard.classList.add("hidden");
  }
});

function switchAdminTab(tab) {
  adminTab = tab;
  ["activations", "tasks", "withdrawals", "services", "settings"].forEach((t) => {
    document.getElementById("panel" + cap(t)).classList.toggle("hidden", t !== tab);
    document.getElementById("tabBtn" + cap(t)).classList.toggle("active", t === tab);
  });
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function fmtTime(ts) {
  if (!ts || !ts.toDate) return "";
  return ts.toDate().toLocaleString("bn-BD");
}

// ---------- অ্যাক্টিভেশন রিকোয়েস্ট ----------
function startListeners() {
  db.collection("activationRequests")
    .where("status", "==", "pending")
    .onSnapshot(
      (snap) => {
        const rows = [];
        snap.forEach((doc) => rows.push({ id: doc.id, ...doc.data() }));
        rows.sort((a, b) => (a.createdAt && b.createdAt ? a.createdAt.toMillis() - b.createdAt.toMillis() : 0));
        document.getElementById("countActivations").textContent = rows.length;
        renderActivations(rows);
      },
      (err) => showAdminError("activations", err)
    );

  db.collection("taskSubmissions")
    .where("status", "==", "pending")
    .onSnapshot(
      (snap) => {
        const rows = [];
        snap.forEach((doc) => rows.push({ id: doc.id, ...doc.data() }));
        rows.sort((a, b) => (a.createdAt && b.createdAt ? a.createdAt.toMillis() - b.createdAt.toMillis() : 0));
        document.getElementById("countTasks").textContent = rows.length;
        renderTaskSubs(rows);
      },
      (err) => showAdminError("tasks", err)
    );

  db.collection("withdrawals")
    .where("status", "==", "pending")
    .onSnapshot(
      (snap) => {
        const rows = [];
        snap.forEach((doc) => rows.push({ id: doc.id, ...doc.data() }));
        rows.sort((a, b) => (a.createdAt && b.createdAt ? a.createdAt.toMillis() - b.createdAt.toMillis() : 0));
        document.getElementById("countWithdrawals").textContent = rows.length;
        renderWithdrawals(rows);
      },
      (err) => showAdminError("withdrawals", err)
    );

  listenAllTasks();
  loadSettings();
}

function showAdminError(panel, err) {
  console.error(panel, err);
  const el = document.getElementById("panel" + cap(panel));
  el.innerHTML = `<p class="empty-note" style="color:#B3261E;">ডাটা লোড করতে সমস্যা হয়েছে: ${err.message}</p>`;
}

function renderActivations(rows) {
  const el = document.getElementById("panelActivations");
  if (rows.length === 0) {
    el.innerHTML = `<p class="empty-note">কোনো পেন্ডিং অ্যাক্টিভেশন রিকোয়েস্ট নেই।</p>`;
    return;
  }
  el.innerHTML = rows
    .map(
      (r) => `
    <div class="admin-card">
      <div class="info">
        <p class="label">${fmtTime(r.createdAt)}</p>
        <p><b>ইউজার আইডি:</b> ${r.userId}</p>
        <p><b>নম্বর:</b> ${r.senderNumber}</p>
        <p><b>TrxID:</b> ${r.trxId}</p>
      </div>
      <div class="actions">
        <button class="btn btn-primary" onclick="approveActivation('${r.id}', '${r.uid}')">অ্যাক্টিভ করুন</button>
        <button class="btn btn-outline-green" onclick="rejectActivation('${r.id}')">বাতিল</button>
      </div>
    </div>`
    )
    .join("");
}

async function approveActivation(reqId, uid) {
  try {
    const batch = db.batch();
    batch.update(db.collection("activationRequests").doc(reqId), { status: "approved" });
    batch.update(db.collection("users").doc(uid), { status: "active" });
    await batch.commit();
    await db.collection("transactions").add({
      uid,
      type: "out",
      label: "অ্যাকাউন্ট অ্যাক্টিভেশন ফি",
      amount: ACTIVATION_FEE,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    alert("সমস্যা হয়েছে: " + err.message);
  }
}

async function rejectActivation(reqId) {
  try {
    await db.collection("activationRequests").doc(reqId).update({ status: "rejected" });
  } catch (err) {
    alert("সমস্যা হয়েছে: " + err.message);
  }
}

// ---------- টাস্ক স্ক্রিনশট ----------
function renderTaskSubs(rows) {
  const el = document.getElementById("panelTasks");
  if (rows.length === 0) {
    el.innerHTML = `<p class="empty-note">কোনো পেন্ডিং টাস্ক জমা নেই।</p>`;
    return;
  }
  el.innerHTML = rows
    .map(
      (r) => `
    <div class="admin-card">
      <div class="info" style="flex:1;">
        <p class="label">${fmtTime(r.createdAt)}</p>
        <p><b>ইউজার আইডি:</b> ${r.userId}</p>
        <p><b>টাস্ক:</b> ${r.taskTitle}</p>
        <p><b>জমা দেওয়া নাম/আইডি:</b> ${r.proofText || "(দেওয়া হয়নি)"}</p>
        <p><b>পুরস্কার:</b> ৳${r.reward}</p>
      </div>
      <div class="actions">
        <button class="btn btn-primary" onclick="approveTask('${r.id}', '${r.uid}', ${r.reward})">অনুমোদন</button>
        <button class="btn btn-outline-green" onclick="rejectTask('${r.id}')">বাতিল</button>
      </div>
    </div>`
    )
    .join("");
}

async function approveTask(subId, uid, reward) {
  try {
    const batch = db.batch();
    batch.update(db.collection("taskSubmissions").doc(subId), { status: "approved" });
    batch.update(db.collection("users").doc(uid), {
      balance: firebase.firestore.FieldValue.increment(reward),
    });
    await batch.commit();

    const subDoc = await db.collection("taskSubmissions").doc(subId).get();
    await db.collection("transactions").add({
      uid,
      type: "in",
      label: `${subDoc.data().taskTitle} (অনুমোদিত)`,
      amount: reward,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    alert("সমস্যা হয়েছে: " + err.message);
  }
}

async function rejectTask(subId) {
  try {
    await db.collection("taskSubmissions").doc(subId).update({ status: "rejected" });
  } catch (err) {
    alert("সমস্যা হয়েছে: " + err.message);
  }
}

// ---------- উইথড্র্র ----------
function renderWithdrawals(rows) {
  const el = document.getElementById("panelWithdrawals");
  if (rows.length === 0) {
    el.innerHTML = `<p class="empty-note">কোনো পেন্ডিং উইথড্র্র নেই।</p>`;
    return;
  }
  el.innerHTML = rows
    .map(
      (r) => `
    <div class="admin-card">
      <div class="info">
        <p class="label">${fmtTime(r.createdAt)}</p>
        <p><b>ইউজার আইডি:</b> ${r.userId}</p>
        <p><b>মাধ্যম:</b> ${r.method}</p>
        <p><b>নম্বর:</b> ${r.number}</p>
        <p><b>ব্যালেন্স:</b> ৳${r.amount}</p>
        <p><b>চার্জ:</b> ৳${r.fee != null ? r.fee : 0}</p>
        <p><b>পাঠাতে হবে:</b> ৳${r.payout != null ? r.payout : r.amount}</p>
      </div>
      <div class="actions">
        <button class="btn btn-primary" onclick="markWithdrawalPaid('${r.id}', '${r.uid}', ${r.amount})">পেমেন্ট দেওয়া হয়েছে</button>
        <button class="btn btn-outline-green" onclick="rejectWithdrawal('${r.id}')">বাতিল</button>
      </div>
    </div>`
    )
    .join("");
}

async function markWithdrawalPaid(reqId, uid, amount) {
  try {
    const batch = db.batch();
    batch.update(db.collection("withdrawals").doc(reqId), { status: "paid" });
    batch.update(db.collection("users").doc(uid), {
      balance: firebase.firestore.FieldValue.increment(-amount),
    });
    await batch.commit();
    await db.collection("transactions").add({
      uid,
      type: "out",
      label: "উইথড্র্র পেমেন্ট",
      amount,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    alert("সমস্যা হয়েছে: " + err.message);
  }
}

async function rejectWithdrawal(reqId) {
  try {
    await db.collection("withdrawals").doc(reqId).update({ status: "rejected" });
  } catch (err) {
    alert("সমস্যা হয়েছে: " + err.message);
  }
}

// ---------- সার্ভিস/টাস্ক ম্যানেজমেন্ট ----------
let allTasksCache = [];
let editingTaskId = null;

function listenAllTasks() {
  db.collection("tasks").onSnapshot(
    (snap) => {
      allTasksCache = [];
      snap.forEach((doc) => allTasksCache.push({ id: doc.id, ...doc.data() }));
      document.getElementById("countServices").textContent = allTasksCache.length;
      renderServicesPanel(allTasksCache);
    },
    (err) => showAdminError("services", err)
  );
}

function renderServicesPanel(rows) {
  const el = document.getElementById("panelServices");
  const addBtnHtml = `<button class="btn btn-primary" style="margin-bottom:14px;" onclick="openTaskForm()">+ নতুন সার্ভিস যোগ করুন</button>`;

  if (rows.length === 0) {
    el.innerHTML = addBtnHtml + `<p class="empty-note">কোনো সার্ভিস নেই। উপরের বাটনে চেপে একটা যোগ করুন।</p>`;
    return;
  }

  el.innerHTML =
    addBtnHtml +
    rows
      .map(
        (t) => `
    <div class="admin-card">
      <div class="info">
        <p class="label">${t.brand || ""} ${t.active === false ? "· নিষ্ক্রিয়" : "· সক্রিয়"}</p>
        <p><b>${t.title || ""}</b></p>
        <p>পুরস্কার: ৳${t.reward || 0}</p>
        ${t.targetUrl ? `<p style="word-break:break-all;font-size:11px;color:var(--muted-2);">${t.targetUrl}</p>` : ""}
      </div>
      <div class="actions">
        <button class="btn btn-outline-green" onclick="openTaskForm('${t.id}')">এডিট</button>
        <button class="btn btn-outline-gold" onclick="toggleTaskActive('${t.id}', ${t.active !== false})">
          ${t.active === false ? "সক্রিয় করুন" : "নিষ্ক্রিয় করুন"}
        </button>
        <button class="btn" style="background:#FBEAEA;color:#B3261E;" onclick="deleteTaskService('${t.id}')">মুছুন</button>
      </div>
    </div>`
      )
      .join("");
}

function openTaskForm(taskId) {
  editingTaskId = taskId || null;
  document.getElementById("taskFormTitle").textContent = taskId ? "সার্ভিস এডিট করুন" : "নতুন সার্ভিস";

  if (taskId) {
    const t = allTasksCache.find((x) => x.id === taskId);
    document.getElementById("taskFormBrand").value = (t && t.brand) || "";
    document.getElementById("taskFormTaskTitle").value = (t && t.title) || "";
    document.getElementById("taskFormReward").value = (t && t.reward) || "";
    document.getElementById("taskFormUrl").value = (t && t.targetUrl) || "";
    document.getElementById("taskFormInstructions").value = (t && t.instructions) || "";
    document.getElementById("taskFormActive").checked = !t || t.active !== false;
  } else {
    document.getElementById("taskFormBrand").value = "";
    document.getElementById("taskFormTaskTitle").value = "";
    document.getElementById("taskFormReward").value = "";
    document.getElementById("taskFormUrl").value = "";
    document.getElementById("taskFormInstructions").value = "";
    document.getElementById("taskFormActive").checked = true;
  }

  document.getElementById("taskFormModal").classList.remove("hidden");
}

function closeTaskForm() {
  document.getElementById("taskFormModal").classList.add("hidden");
  editingTaskId = null;
}

async function saveTaskForm() {
  const brand = document.getElementById("taskFormBrand").value.trim();
  const title = document.getElementById("taskFormTaskTitle").value.trim();
  const reward = parseInt(document.getElementById("taskFormReward").value, 10);
  const targetUrl = document.getElementById("taskFormUrl").value.trim();
  const instructions = document.getElementById("taskFormInstructions").value.trim();
  const active = document.getElementById("taskFormActive").checked;

  if (!brand || !title || !reward || isNaN(reward)) {
    alert("ব্র্যান্ড, শিরোনাম, এবং পুরস্কার (সংখ্যা) — এই তিনটা আবশ্যক।");
    return;
  }

  const data = { brand, title, reward, targetUrl, instructions, active };

  try {
    if (editingTaskId) {
      await db.collection("tasks").doc(editingTaskId).update(data);
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("tasks").add(data);
    }
    closeTaskForm();
  } catch (err) {
    alert("সেভ করতে সমস্যা হয়েছে: " + err.message);
  }
}

async function toggleTaskActive(taskId, current) {
  try {
    await db.collection("tasks").doc(taskId).update({ active: !current });
  } catch (err) {
    alert("সমস্যা হয়েছে: " + err.message);
  }
}

async function deleteTaskService(taskId) {
  if (!confirm("আপনি কি নিশ্চিত এই সার্ভিসটা মুছে ফেলতে চান? ইউজাররা এটা আর দেখতে পাবে না।")) return;
  try {
    await db.collection("tasks").doc(taskId).delete();
  } catch (err) {
    alert("সমস্যা হয়েছে: " + err.message);
  }
}

// ---------- সেটিংস (bKash/নগদ পেমেন্ট নম্বর) ----------
function loadSettings() {
  db.collection("settings")
    .doc("config")
    .onSnapshot(
      (snap) => {
        const d = snap.exists ? snap.data() : {};
        document.getElementById("settingsPaymentNumber").value = d.paymentNumber || PAYMENT_RECEIVE_NUMBER;
        document.getElementById("settingsMinWithdraw").value = d.minWithdraw || MIN_WITHDRAW;
      },
      (err) => showAdminError("settings", err)
    );
}

async function saveSettings() {
  const number = document.getElementById("settingsPaymentNumber").value.trim();
  const minWithdrawRaw = document.getElementById("settingsMinWithdraw").value.trim();
  const minWithdraw = parseInt(minWithdrawRaw, 10);

  if (!number) {
    alert("একটা পেমেন্ট নম্বর দিন।");
    return;
  }
  if (!minWithdrawRaw || isNaN(minWithdraw) || minWithdraw <= 0) {
    alert("ন্যূনতম উইথড্র্র পরিমাণ একটা সঠিক সংখ্যা হতে হবে।");
    return;
  }

  try {
    await db.collection("settings").doc("config").set(
      { paymentNumber: number, minWithdraw },
      { merge: true }
    );
    const msg = document.getElementById("settingsSavedMsg");
    msg.classList.remove("hidden");
    setTimeout(() => msg.classList.add("hidden"), 2500);
  } catch (err) {
    alert("সেভ করতে সমস্যা হয়েছে: " + err.message);
  }
}
