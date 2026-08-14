document.addEventListener("DOMContentLoaded", () => {
    // --- STATE VARIABLES ---
    let currentUser = null;
    let historyData = [];
    let chartInstance = null;
    let loadingInterval = null;
    let selectedFile = null;

    // --- DOM SELECTORS ---
    
    // Views
    const viewLanding = document.getElementById("viewLanding");
    const viewAuth = document.getElementById("viewAuth");
    const viewApp = document.getElementById("viewApp");

    // Auth Forms
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const tabBtnLogin = document.getElementById("tabBtnLogin");
    const tabBtnSignup = document.getElementById("tabBtnSignup");
    const logoutBtn = document.getElementById("logoutBtn");
    const userEmailLabel = document.getElementById("userEmailLabel");

    // Dashboard Overview widgets
    const tabDashboard = document.getElementById("tabDashboard");
    const statTotalScans = document.getElementById("statTotalScans");
    const statAvgScore = document.getElementById("statAvgScore");
    const statMaxScore = document.getElementById("statMaxScore");
    const appHistoryList = document.getElementById("appHistoryList");

    // Scan Tab elements
    const tabUpload = document.getElementById("tabUpload");
    const appDropZone = document.getElementById("appDropZone");
    const appFileInput = document.getElementById("appFileInput");
    const appUploadForm = document.getElementById("appUploadForm");
    const appAnalyzeBtn = document.getElementById("appAnalyzeBtn");
    const appLoadingState = document.getElementById("appLoadingState");
    const appLoadingText = document.getElementById("appLoadingText");
    const appResultsCard = document.getElementById("appResultsCard");

    // Result Widgets
    const appResultsFilename = document.getElementById("appResultsFilename");
    const appScoreMeter = document.getElementById("appScoreMeter");
    const appScoreValue = document.getElementById("appScoreValue");
    const appScoreVerdict = document.getElementById("appScoreVerdict");
    const appScoreSummary = document.getElementById("appScoreSummary");
    const appKeywordsList = document.getElementById("appKeywordsList");
    const appSuggestionsList = document.getElementById("appSuggestionsList");

    // --- INITIAL SESSION CHECK ---
    checkSession();

    // --- SPA VIEW ROUTING UTILITIES ---
    window.showView = function(viewName, authTab = 'login') {
        // Hide all views
        viewLanding.classList.add("hidden");
        viewAuth.classList.add("hidden");
        viewApp.classList.add("hidden");

        // Toggle selected view
        if (viewName === 'Landing') {
            viewLanding.classList.remove("hidden");
        } else if (viewName === 'Auth') {
            viewAuth.classList.remove("hidden");
            switchAuthTab(authTab);
        } else if (viewName === 'App') {
            viewApp.classList.remove("hidden");
            switchAppTab('dashboard'); // Default tab inside app
            fetchHistory();
        }
    };

    // Tab Switcher inside Auth card
    window.switchAuthTab = function(tabName) {
        if (tabName === 'login') {
            loginForm.classList.remove("hidden");
            signupForm.classList.add("hidden");
            tabBtnLogin.classList.add("active");
            tabBtnSignup.classList.remove("active");
        } else {
            loginForm.classList.add("hidden");
            signupForm.classList.remove("hidden");
            tabBtnLogin.classList.remove("active");
            tabBtnSignup.classList.add("active");
        }
    };

    // Tab Switcher inside App Dashboard layout
    window.switchAppTab = function(tabName) {
        document.querySelectorAll(".nav-item").forEach(btn => btn.classList.remove("active"));
        
        if (tabName === 'dashboard') {
            tabDashboard.classList.remove("hidden");
            tabUpload.classList.add("hidden");
            document.querySelector("button[onclick*='dashboard']").classList.add("active");
            fetchHistory(); // Reload history and metrics
        } else {
            tabDashboard.classList.add("hidden");
            tabUpload.classList.remove("hidden");
            document.querySelector("button[onclick*='upload']").classList.add("active");
            resetUploadForm();
            appResultsCard.classList.add("hidden");
        }
    };

    // --- SESSION UTILITIES ---
    function checkSession() {
        fetch("/api/auth/me")
        .then(res => res.json())
        .then(data => {
            if (data.logged_in) {
                currentUser = data.user;
                userEmailLabel.innerText = currentUser.email;
                showView('App');
            } else {
                currentUser = null;
                showView('Landing');
            }
        })
        .catch(err => {
            console.error("Session check error:", err);
            showView('Landing');
        });
    }

    // --- AUTHENTICATION ACTION HANDLERS ---

    // Signup submission
    signupForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const email = document.getElementById("signupEmail").value.trim();
        const password = document.getElementById("signupPassword").value;

        fetch("/api/auth/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: jsonPayload({ email, password })
        })
        .then(res => handleAuthResponse(res, "Account registration failed"))
        .then(data => {
            currentUser = data.user;
            userEmailLabel.innerText = currentUser.email;
            signupForm.reset();
            showView('App');
        })
        .catch(err => alert(err.message));
    });

    // Login submission
    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;

        fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: jsonPayload({ email, password })
        })
        .then(res => handleAuthResponse(res, "Invalid email or password"))
        .then(data => {
            currentUser = data.user;
            userEmailLabel.innerText = currentUser.email;
            loginForm.reset();
            showView('App');
        })
        .catch(err => alert(err.message));
    });

    // Logout submission
    logoutBtn.addEventListener("click", () => {
        fetch("/api/auth/logout", { method: "POST" })
        .then(res => res.json())
        .then(() => {
            currentUser = null;
            historyData = [];
            if (chartInstance) {
                chartInstance.destroy();
                chartInstance = null;
            }
            showView('Landing');
        })
        .catch(err => console.error("Logout failed:", err));
    });

    function jsonPayload(obj) {
        return JSON.stringify(obj);
    }

    function handleAuthResponse(res, defaultError) {
        if (!res.ok) {
            return res.json().then(err => { throw new Error(err.error || defaultError) });
        }
        return res.json();
    }

    // --- UPLOAD TAB DRAG & DROP HANDLING ---
    
    appDropZone.addEventListener("click", () => appFileInput.click());

    appFileInput.addEventListener("change", () => {
        if (appFileInput.files.length) handleFileSelect(appFileInput.files[0]);
    });

    appDropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        appDropZone.classList.add("drop-zone--over");
    });

    ["dragleave", "dragend"].forEach(type => {
        appDropZone.addEventListener(type, () => appDropZone.classList.remove("drop-zone--over"));
    });

    appDropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        appDropZone.classList.remove("drop-zone--over");
        if (e.dataTransfer.files.length) {
            appFileInput.files = e.dataTransfer.files;
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    function handleFileSelect(file) {
        if (file.type !== "application/pdf") {
            alert("Only PDF files are supported!");
            resetUploadForm();
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert("File size exceeds the 5MB limit.");
            resetUploadForm();
            return;
        }
        selectedFile = file;
        appDropZone.innerHTML = `
            <div class="drop-zone__thumb">
                <span class="drop-zone__icon">📄</span>
                <span class="drop-zone__thumb-title">${file.name}</span>
                <span class="drop-zone__thumb-size">${(file.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
        `;
        appAnalyzeBtn.disabled = false;
    }

    function resetUploadForm() {
        selectedFile = null;
        appFileInput.value = "";
        appAnalyzeBtn.disabled = true;
        appDropZone.innerHTML = `
            <span class="drop-zone__icon">📂</span>
            <span class="drop-zone__prompt">Drag & drop your PDF file here or <span class="browse-link">Browse files</span></span>
        `;
    }

    // --- AI ANALYSIS TRIGGER ---
    appUploadForm.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!selectedFile) return;

        appResultsCard.classList.add("hidden");
        appLoadingState.classList.remove("hidden");
        appAnalyzeBtn.disabled = true;
        
        startLoadingMessages();

        const formData = new FormData();
        formData.append("file", selectedFile);

        fetch("/api/upload", {
            method: "POST",
            body: formData
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.error || "Analysis failed") });
            }
            return res.json();
        })
        .then(data => {
            stopLoadingMessages();
            appLoadingState.classList.add("hidden");
            displayResults(data);
            resetUploadForm();
        })
        .catch(err => {
            stopLoadingMessages();
            appLoadingState.classList.add("hidden");
            appAnalyzeBtn.disabled = false;
            alert(err.message || "An error occurred.");
        });
    });

    function startLoadingMessages() {
        const messages = [
            "Extracting resume text contents...",
            "Validating layout margins...",
            "Consulting Llama model on Groq...",
            "Evaluating ATS score metric...",
            "Formatting response JSON..."
        ];
        let idx = 0;
        appLoadingText.innerText = messages[0];
        loadingInterval = setInterval(() => {
            idx = (idx + 1) % messages.length;
            appLoadingText.innerText = messages[idx];
        }, 2000);
    }

    function stopLoadingMessages() {
        if (loadingInterval) {
            clearInterval(loadingInterval);
            loadingInterval = null;
        }
    }

    // --- DISPLAY DETAILED RESULTS ---
    function displayResults(data) {
        appResultsCard.classList.remove("hidden");
        appResultsFilename.innerText = data.filename;
        
        // Animate circular gauge
        animateRadialGauge(data.ats_score);
        
        // Render tags
        appKeywordsList.innerHTML = "";
        if (data.missing_keywords && data.missing_keywords.length > 0) {
            data.missing_keywords.forEach(kw => {
                const tag = document.createElement("span");
                tag.className = "keyword-tag";
                tag.innerText = kw;
                appKeywordsList.appendChild(tag);
            });
        } else {
            appKeywordsList.innerHTML = `<p class="empty-state" style="padding:0; text-align:left;">Excellent alignment! No keywords missing.</p>`;
        }

        // Render bullet recommendations
        appSuggestionsList.innerHTML = "";
        if (data.suggestions && data.suggestions.length > 0) {
            data.suggestions.forEach(sug => {
                const li = document.createElement("li");
                li.innerText = sug;
                appSuggestionsList.appendChild(li);
            });
        } else {
            appSuggestionsList.innerHTML = `<li>Formatting rules follow professional guidelines.</li>`;
        }

        appResultsCard.scrollIntoView({ behavior: "smooth" });
    }

    function animateRadialGauge(score) {
        let current = 0;
        const duration = 800;
        const start = performance.now();

        function step(now) {
            const progress = Math.min((now - start) / duration, 1);
            current = Math.floor(progress * score);
            appScoreValue.innerText = current;

            let color = "var(--danger)";
            if (current >= 80) color = "var(--success)";
            else if (current >= 60) color = "var(--warning)";

            appScoreMeter.style.background = `conic-gradient(${color} ${current * 3.6}deg, #171d2b 0deg)`;

            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                updateScoreVerdict(score);
            }
        }
        requestAnimationFrame(step);
    }

    function updateScoreVerdict(score) {
        if (score >= 80) {
            appScoreVerdict.innerText = "Excellent Match!";
            appScoreVerdict.style.color = "var(--success)";
            appScoreSummary.innerText = "Your resume is highly optimized for applicant databases. Apply minor fixes below.";
        } else if (score >= 60) {
            appScoreVerdict.innerText = "Moderate Match";
            appScoreVerdict.style.color = "var(--warning)";
            appScoreSummary.innerText = "Solid details are present, but adding target keywords will increase algorithmic matching.";
        } else {
            appScoreVerdict.innerText = "Action Required";
            appScoreVerdict.style.color = "var(--danger)";
            appScoreSummary.innerText = "Low score. Missing crucial industry keywords or formatting structure. Implement feedback.";
        }
    }

    // --- RECENT HISTORY & GRAPH POPULATION ---
    function fetchHistory() {
        fetch("/api/history")
        .then(res => res.json())
        .then(history => {
            historyData = history;
            populateHistorySidebar(history);
            calculateDashboardMetrics(history);
            renderPerformanceChart(history);
        })
        .catch(err => console.error("Error fetching evaluations history:", err));
    }

    function populateHistorySidebar(history) {
        appHistoryList.innerHTML = "";
        if (!history || history.length === 0) {
            appHistoryList.innerHTML = `<p class="empty-state">No evaluations run yet. Scan a resume to begin!</p>`;
            return;
        }

        history.forEach(item => {
            const row = document.createElement("div");
            row.className = "history-item";
            row.dataset.analysisId = item.analysis_id;

            let badgeClass = "score-low";
            if (item.ats_score >= 80) badgeClass = "score-high";
            else if (item.ats_score >= 60) badgeClass = "score-medium";

            const dateStr = new Date(item.analyzed_at).toLocaleDateString(undefined, {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
            });

            row.innerHTML = `
                <div class="item-info">
                    <span class="item-name" title="${item.filename}">${item.filename}</span>
                    <span class="item-time">${dateStr}</span>
                </div>
                <span class="item-badge ${badgeClass}">${item.ats_score}</span>
            `;

            row.addEventListener("click", () => {
                document.querySelectorAll(".history-item").forEach(el => el.classList.remove("active"));
                row.classList.add("active");
                
                // Switch view and fetch details
                switchAppTab('upload');
                loadSingleEvaluation(item.analysis_id);
            });

            appHistoryList.appendChild(row);
        });
    }

    function loadSingleEvaluation(analysisId) {
        appResultsCard.classList.add("hidden");
        appLoadingState.classList.remove("hidden");
        appLoadingText.innerText = "Loading report details...";

        fetch(`/api/results/${analysisId}`)
        .then(res => res.json())
        .then(data => {
            appLoadingState.classList.add("hidden");
            displayResults(data);
        })
        .catch(err => {
            appLoadingState.classList.add("hidden");
            alert("Failed to retrieve details.");
        });
    }

    function calculateDashboardMetrics(history) {
        if (!history || history.length === 0) {
            statTotalScans.innerText = "0";
            statAvgScore.innerText = "0%";
            statMaxScore.innerText = "0%";
            return;
        }

        const total = history.length;
        const sum = history.reduce((acc, curr) => acc + curr.ats_score, 0);
        const max = history.reduce((acc, curr) => Math.max(acc, curr.ats_score), 0);
        const avg = Math.round(sum / total);

        statTotalScans.innerText = total;
        statAvgScore.innerText = `${avg}%`;
        statMaxScore.innerText = `${max}%`;
    }

    // Chart.js Graph Rendering
    function renderPerformanceChart(history) {
        const ctx = document.getElementById("atsTrendChart").getContext("2d");
        
        if (chartInstance) {
            chartInstance.destroy();
        }

        if (!history || history.length === 0) {
            // Draw empty placeholder graph
            drawEmptyChart(ctx);
            return;
        }

        // Plot chronologically, which is oldest (end of history array) to newest (start of history array)
        const chronologicalData = [...history].reverse();
        const labels = chronologicalData.map((item, idx) => `Scan #${idx + 1}`);
        const scores = chronologicalData.map(item => item.ats_score);

        chartInstance = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels,
                datasets: [{
                    label: "ATS Match Score",
                    data: scores,
                    borderColor: "#6366f1",
                    backgroundColor: "rgba(99, 102, 241, 0.05)",
                    borderWidth: 3,
                    tension: 0.35,
                    fill: true,
                    pointBackgroundColor: "#a855f7",
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        min: 0,
                        max: 100,
                        grid: { color: "rgba(255, 255, 255, 0.04)" },
                        ticks: { color: "#9ca3af", font: { family: "Outfit" } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: "#9ca3af", font: { family: "Outfit" } }
                    }
                }
            }
        });
    }

    function drawEmptyChart(ctx) {
        chartInstance = new Chart(ctx, {
            type: "line",
            data: {
                labels: ["Run 1", "Run 2", "Run 3"],
                datasets: [{
                    data: [0, 0, 0],
                    borderColor: "rgba(255, 255, 255, 0.1)",
                    borderDash: [5, 5]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { min: 0, max: 100, grid: { color: "rgba(255,255,255,0.02)" } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
});
