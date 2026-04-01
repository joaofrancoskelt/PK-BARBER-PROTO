/* =========================================================
   CONFIGURAÇÕES DO SISTEMA E PIX
   ========================================================= */
const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbxVBjo7_Tc-YASE6TDhPWKDv8vx8WlvG3qEAclqRR8B28OGXrfblngYKAcFNSu_j6N5Fw/exec", 
    PIX_KEY: "seuemail@gmail.com",
    PIX_NAME: "Patrick Lima",
    PIX_CITY: "Curitiba",
    BUSINESS_START: 9, // 09:00
    BUSINESS_END: 19,  // 19:00
    ADMIN_PASS: "pk2026"
};

/* =========================================================
   MÓDULO 1: CAMADA DE BANCO DE DADOS HÍBRIDA (Cloud + Local)
   ========================================================= */
const DB = {
    prefix: 'pk_pro_', 
    
    syncDown: async function() {
        if (!CONFIG.API_URL.includes("script.google.com")) return;
        
        try {
            const res = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'READ_ALL' }),
                redirect: 'follow'
            });
            
            const result = await res.json();
            
            if (result.success) {
                const cleanData = (arr) => arr.map(item => {
                    if (item.date && String(item.date).includes('T')) {
                        item.date = String(item.date).split('T')[0];
                    }
                    if (item.status) {
                        item.status = String(item.status).trim();
                    }
                    if (item.time) {
                        let tStr = String(item.time);
                        let match = tStr.match(/(\d{1,2}):(\d{2})/);
                        if (match) {
                            let h = match[1];
                            let m = match[2];
                            
                            if (tStr.includes('T') && tStr.includes('Z')) {
                                let d = new Date(tStr);
                                h = String(d.getUTCHours() - 3); 
                                if (h < 0) h = 24 + h; 
                            }
                            item.time = `${String(h).padStart(2,'0')}:${m.padStart(2,'0')}`;
                        } else if (!isNaN(parseFloat(tStr))) {
                            let totalMins = Math.round(parseFloat(tStr) * 24 * 60);
                            let h = Math.floor(totalMins / 60);
                            let m = totalMins % 60;
                            item.time = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
                        }
                    }
                    return item;
                });

                this.set('services', result.db.services);
                this.set('barbers', result.db.barbers);
                this.set('clients', result.db.clients);
                this.set('appointments', cleanData(result.db.appointments));
                this.set('blocks', cleanData(result.db.blocks));
                
                if(sessionStorage.getItem('pk_admin_auth') === 'true') {
                    UI.toast("✅ Banco de dados sincronizado!", "success");
                }
                
                UI.renderCatalog(); 
                if(document.getElementById('admin-view').style.display === 'flex') Admin.init();
            } else {
                console.error("Erro na Planilha: " + result.error);
            }
        } catch (e) {
            console.error("Falha ao conectar com a API", e);
        }
    },

    pushUp: async function(action, table, id, data) {
        if (!CONFIG.API_URL.includes("script.google.com")) return;
        try {
            const res = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action, table, id, data }),
                redirect: 'follow'
            });
            const result = await res.json();
            if(!result.success) console.error("Erro do Script:", result.error);
        } catch(e) { console.error("Erro de Fetch Push:", e); }
    },

    get: function(table) { return JSON.parse(localStorage.getItem(this.prefix + table)) || []; },
    set: function(table, data) { localStorage.setItem(this.prefix + table, JSON.stringify(data)); },
    
    insert: function(table, item) {
        const data = this.get(table);
        item.id = item.id || Date.now();
        data.push(item);
        this.set(table, data);
        this.pushUp('INSERT', table, null, item); 
        return item;
    },
    
    update: function(table, id, updates) {
        const data = this.get(table);
        const idx = data.findIndex(i => String(i.id) === String(id));
        if (idx > -1) {
            data[idx] = { ...data[idx], ...updates };
            this.set(table, data);
            this.pushUp('UPDATE', table, id, updates); 
            return true;
        }
        return false;
    },
    
    delete: function(table, id) {
        let data = this.get(table);
        this.set(table, data.filter(i => String(i.id) !== String(id)));
        this.pushUp('DELETE', table, id, null); 
    },

    initLocalFallback: function() {
        if (!localStorage.getItem(this.prefix + 'services')) {
            this.set('services', [{ id: 1, name: 'Corte Degradê / Fade', price: 45, duration: 30, desc: 'O clássico urbano.' }]);
            this.set('barbers', [{ id: 1, name: 'Patrick Lima', active: true }]);
            this.set('clients', []);
            this.set('appointments', []);
            this.set('blocks', []);
        }
    },

    factoryReset: function() {
        if (confirm("ATENÇÃO: Isso apagará os dados do seu navegador. Continuar?")) {
            Object.keys(localStorage).forEach(key => { if (key.startsWith(this.prefix)) localStorage.removeItem(key); });
            location.reload();
        }
    }
};

/* =========================================================
   MÓDULO 2: CRM & CLIENTES
   ========================================================= */
const CRM = {
    registerOrUpdate: function(name, phone) {
        let clients = DB.get('clients');
        const cleanPhone = phone.replace(/\D/g, ''); 
        let client = clients.find(c => String(c.phone) === String(cleanPhone));

        if (client) {
            const updates = {
                visits: (parseInt(client.visits) || 0) + 1,
                lastVisit: new Date().toISOString().split('T')[0],
                name: name
            };
            DB.update('clients', client.id, updates);
            return { ...client, ...updates }; 
        } else {
            client = { id: Date.now(), name, phone: cleanPhone, visits: 1, noShows: 0, lastVisit: new Date().toISOString().split('T')[0] };
            DB.insert('clients', client);
            return client;
        }
    },
    registerNoShow: function(clientId) {
        let client = DB.get('clients').find(c => String(c.id) === String(clientId));
        if(client) {
            DB.update('clients', client.id, { noShows: (parseInt(client.noShows) || 0) + 1 });
        }
    }
};

/* =========================================================
   MÓDULO 3: UI & UTILITÁRIOS
   ========================================================= */
const UI = {
    toast: function(msg, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerText = msg;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },
    formatCurrency: (val) => `R$ ${parseFloat(val || 0).toFixed(2).replace('.', ',')}`,
    formatDateBR: (isoDate) => isoDate ? isoDate.split('-').reverse().join('/') : '',
    
    renderCatalog: function() {
        const grid = document.getElementById('services-grid');
        if (!grid) return;
        grid.innerHTML = '';
        DB.get('services').forEach(srv => {
            grid.innerHTML += `
                <div class="service-card">
                    <h3>${srv.name}</h3>
                    <div class="service-price">${this.formatCurrency(srv.price)}</div>
                    <p class="text-muted mb-20">⏱️ ${srv.duration} min</p>
                    <p class="text-muted">${srv.desc}</p>
                </div>`;
        });
        const dateInput = document.getElementById('booking-date');
        if(dateInput) {
            const today = new Date();
            const offset = today.getTimezoneOffset();
            const localToday = new Date(today.getTime() - (offset*60*1000));
            
            dateInput.min = localToday.toISOString().split("T")[0]; 
            dateInput.value = ''; 
        }
    },
    openBooking: function() {
        document.getElementById('booking-modal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
        Booking.initWizard();
    },
    closeBooking: function() {
        document.getElementById('booking-modal').style.display = 'none';
        document.body.style.overflow = 'auto';
        Booking.reset();
    }
};

/* =========================================================
   MÓDULO 4: LÓGICA DE AGENDAMENTO (Booking Engine)
   ========================================================= */
const Booking = {
    currentStep: 1,
    data: {},

    reset: function() { this.currentStep = 1; this.data = {}; this.updateView(); },
    
    initWizard: function() {
        const srvModal = document.getElementById('modal-services');
        srvModal.innerHTML = '';
        DB.get('services').forEach(srv => {
            srvModal.innerHTML += `<div class="option-card" onclick="Booking.selectService(${srv.id}, this)">
                <h4>${srv.name}</h4><p class="text-muted">${UI.formatCurrency(srv.price)} • ${srv.duration}m</p></div>`;
        });

        const brbModal = document.getElementById('modal-barbers');
        brbModal.innerHTML = '';
        DB.get('barbers').filter(b => b.active !== false && b.active !== "FALSE").forEach(brb => {
            brbModal.innerHTML += `<div class="option-card" onclick="Booking.selectBarber(${brb.id}, this)"><h4>${brb.name}</h4></div>`;
        });
        this.reset();
        
        if(document.getElementById('booking-date').value) this.generateTimeSlots();
    },

    updateView: function() {
        document.querySelectorAll('.wizard-step').forEach((el, index) => {
            el.classList.toggle('active', index + 1 === this.currentStep);
        });
        const progBar = document.getElementById('wizard-progress');
        if(this.currentStep === 5 && progBar.children.length === 4) {
            progBar.innerHTML += `<div class="step-indicator active">5</div>`;
        } else if (this.currentStep < 5 && progBar.children.length === 5) {
            progBar.removeChild(progBar.lastChild);
        }
        document.querySelectorAll('.step-indicator').forEach((el, index) => {
            el.classList.toggle('active', index + 1 <= this.currentStep);
        });
    },

    prevStep: function() { this.currentStep--; this.updateView(); },
    nextStep: function() { 
        if(this.currentStep === 3) this.buildSummary();
        this.currentStep++; 
        this.updateView(); 
    },

    selectService: function(id, el) {
        document.querySelectorAll('#modal-services .option-card').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        this.data.service = DB.get('services').find(s => String(s.id) === String(id));
        setTimeout(() => this.nextStep(), 300);
    },

    selectBarber: function(id, el) {
        document.querySelectorAll('#modal-barbers .option-card').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        this.data.barber = DB.get('barbers').find(b => String(b.id) === String(id));
        setTimeout(() => this.nextStep(), 300);
    },

    generateTimeSlots: function() {
        this.data.date = document.getElementById('booking-date').value;
        const grid = document.getElementById('modal-times');
        grid.innerHTML = '';
        
        if (!this.data.date || !this.data.barber) return;

        const selectedDate = new Date(this.data.date + 'T00:00:00');
        const dayOfWeek = selectedDate.getDay(); 

        if (dayOfWeek === 0 || dayOfWeek === 1) {
            grid.innerHTML = `
                <p class="text-muted" style="grid-column: 1/-1; padding: 20px; border: 1px dashed #dc3545; border-radius: 8px;">
                    🚫 <strong>Barbearia Fechada:</strong><br>
                    Não atendemos aos domingos e segundas-feiras. Por favor, escolha outro dia!
                </p>`;
            document.getElementById('btn-next-time').disabled = true;
            return;
        }

        const appointments = DB.get('appointments').filter(a => {
            if (a.date !== this.data.date) return false;
            if (a.status === 'Cancelado') return false;
            if (a.barberId && String(a.barberId) !== String(this.data.barber.id) && String(a.barberId) !== 'undefined') return false;
            return true;
        });

        const blocks = DB.get('blocks').filter(b => b.date === this.data.date && (String(b.barberId) === String(this.data.barber.id) || b.barberId === 'ALL'));
        
        if(blocks.length > 0) {
            grid.innerHTML = '<p class="text-muted" style="grid-column: 1/-1;">Data bloqueada para este profissional.</p>';
            return;
        }

        let slots = [];
        for(let h = CONFIG.BUSINESS_START; h < CONFIG.BUSINESS_END; h++) {
            slots.push(`${String(h).padStart(2,'0')}:00`);
            slots.push(`${String(h).padStart(2,'0')}:30`);
        }

        const durationMinutes = parseInt(this.data.service.duration);
        const slotsNeeded = Math.ceil(durationMinutes / 30);
        let slotsAdded = 0;

        const today = new Date();
        const offset = today.getTimezoneOffset();
        const localToday = new Date(today.getTime() - (offset*60*1000));
        const todayStr = localToday.toISOString().split("T")[0];
        
        const isToday = (this.data.date === todayStr);
        const currentMinsTotal = today.getHours() * 60 + today.getMinutes();

        slots.forEach((time, index) => {
            let canBook = true;
            for(let i = 0; i < slotsNeeded; i++) {
                let checkTime = slots[index + i];
                if(!checkTime) { canBook = false; break; } 
                
                let [h, m] = checkTime.split(':').map(Number);
                let checkMins = h * 60 + m;

                if (isToday && checkMins <= currentMinsTotal) {
                    canBook = false;
                    break;
                }

                let conflict = appointments.some(app => {
                    let [ah, am] = String(app.time).split(':').map(Number);
                    if (isNaN(ah) || isNaN(am)) return false; 
                    
                    let appStartMins = ah * 60 + am;
                    let dur = parseInt(String(app.duration).replace(/\D/g, '')) || 30;
                    let appEndMins = appStartMins + dur;
                    
                    return (checkMins >= appStartMins && checkMins < appEndMins);
                });
                
                if(conflict) { canBook = false; break; }
            }

            if(canBook) {
                const div = document.createElement('div');
                div.className = 'time-slot';
                div.innerText = time;
                
                div.onclick = () => {
                    document.querySelectorAll('.time-slot').forEach(e => e.classList.remove('selected'));
                    div.classList.add('selected');
                    this.data.time = time;
                    document.getElementById('btn-next-time').disabled = false;
                };
                
                grid.appendChild(div);
                slotsAdded++;
            }
        });

        if(slotsAdded === 0) {
            grid.innerHTML = '<p class="text-muted" style="grid-column: 1/-1; text-align: center; padding: 15px;">Nenhum horário disponível para este dia. 😢<br>Por favor, tente outra data.</p>';
        }
    },

    buildSummary: function() {
        document.getElementById('summary-text').innerHTML = `
            <br>✂️ ${this.data.service.name} com ${this.data.barber.name}
            <br>🗓️ ${UI.formatDateBR(this.data.date)} às ${this.data.time}
            <br>💰 Total: ${UI.formatCurrency(this.data.service.price)}`;
    },

    selectPayment: function(method) {
        this.data.payment = method;
        document.getElementById('pay-pix').classList.toggle('selected', method === 'PIX');
        document.getElementById('pay-local').classList.toggle('selected', method === 'No Local');
        document.getElementById('btn-finish').innerText = method === 'PIX' ? "Gerar PIX e Continuar" : "Confirmar Horário";
        this.validateForm();
    },

    validateForm: function() {
        this.data.clientName = document.getElementById('client-name').value;
        this.data.clientPhone = document.getElementById('client-phone').value;
        const btn = document.getElementById('btn-finish');
        btn.disabled = !(this.data.clientName.length > 2 && this.data.clientPhone.length >= 10 && this.data.payment);
    },

    processPaymentChoice: function() {
        if(this.data.payment === 'PIX') {
            document.getElementById('pix-valor-display').innerText = parseFloat(this.data.service.price).toFixed(2).replace('.', ',');
            const pixString = PixHelper.generate(CONFIG.PIX_KEY, CONFIG.PIX_NAME, CONFIG.PIX_CITY, parseFloat(this.data.service.price));
            document.getElementById('pix-copia-cola').value = pixString;
            document.getElementById('pix-qrcode').src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixString)}`;
            this.nextStep();
        } else {
            this.submitFinal();
        }
    },

    submitFinal: function() {
        const client = CRM.registerOrUpdate(this.data.clientName, this.data.clientPhone);

        const appt = {
            clientId: client.id,
            barberId: this.data.barber.id,
            serviceId: this.data.service.id,
            clientName: client.name,
            clientPhone: client.phone,
            serviceName: this.data.service.name,
            barberName: this.data.barber.name,
            date: this.data.date,
            time: this.data.time,
            duration: this.data.service.duration,
            price: this.data.service.price,
            payment: this.data.payment,
            status: 'Pendente', 
            createdAt: new Date().toISOString()
        };
        
        DB.insert('appointments', appt);

        let msg = `*Novo Agendamento PK BARBER*%0A%0A👤 ${appt.clientName}%0A✂️ ${appt.serviceName}%0A👨‍🎨 ${appt.barberName}%0A📅 ${UI.formatDateBR(appt.date)} às ${appt.time}%0A💳 Pgto: ${appt.payment}%0A%0A⏳ *Aguardando confirmação da barbearia.*`;
        window.open(`https://wa.me/5541996043963?text=${msg}`, '_blank');
        
        UI.toast("Agendamento enviado para aprovação!");
        UI.closeBooking();
        
        if(document.getElementById('admin-view').style.display === 'flex') Admin.init();
    }
};

/* =========================================================
   MÓDULO 5: ADMIN & ANALYTICS
   ========================================================= */
const Auth = {
    showLogin: () => { document.getElementById('login-modal').style.display = 'flex'; },
    closeLogin: () => { document.getElementById('login-modal').style.display = 'none'; },
    login: () => {
        if(document.getElementById('admin-password').value === CONFIG.ADMIN_PASS) {
            sessionStorage.setItem('pk_admin_auth', 'true');
            document.getElementById('public-view').style.display = 'none';
            document.getElementById('login-modal').style.display = 'none';
            document.getElementById('admin-view').style.display = 'flex';
            Admin.init();
        } else {
            UI.toast("Senha incorreta", "error");
        }
    },
    logout: () => {
        sessionStorage.removeItem('pk_admin_auth');
        location.reload();
    }
};

const Admin = {
    init: function() {
        document.getElementById('filter-date').value = new Date().toISOString().split("T")[0];
        this.renderDashboard();
        this.renderAgenda();
        this.renderCRM();
        this.renderServices();
        this.renderTeam();
    },

    switchTab: function(tab) {
        document.querySelectorAll('.admin-tab').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.admin-menu li').forEach(el => el.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');
        event.currentTarget.classList.add('active');
        this.init(); 
    },

    renderDashboard: function() {
        const apps = DB.get('appointments');
        const today = new Date().toISOString().split("T")[0];
        const currentMonth = today.substring(0, 7);

        let revMonth = 0, revToday = 0, countToday = 0;
        let noShows = 0, totalFinished = 0;
        let barberPerf = {};
        DB.get('barbers').forEach(b => barberPerf[b.name] = 0);

        apps.forEach(a => {
            const price = parseFloat(a.price) || 0;
            if(a.status === 'Concluido') {
                totalFinished++;
                if(a.date === today) revToday += price;
                if(a.date.startsWith(currentMonth)) {
                    revMonth += price;
                    if(barberPerf[a.barberName] !== undefined) barberPerf[a.barberName] += price;
                }
            }
            if(a.date === today && a.status !== 'Cancelado') countToday++;
            if(a.status === 'Faltou') noShows++;
        });

        const noShowRate = apps.length ? ((noShows / apps.length) * 100).toFixed(1) : 0;

        document.getElementById('stat-revenue-month').innerText = UI.formatCurrency(revMonth);
        document.getElementById('stat-revenue-today').innerText = UI.formatCurrency(revToday);
        document.getElementById('stat-count-today').innerText = countToday;
        document.getElementById('stat-noshow-rate').innerText = `${noShowRate}%`;

        const bpGrid = document.getElementById('barber-performance-grid');
        bpGrid.innerHTML = '';
        Object.entries(barberPerf).forEach(([name, rev]) => {
            bpGrid.innerHTML += `<div class="stat-card"><h4>${name}</h4><div class="stat-value" style="color: var(--purple);">${UI.formatCurrency(rev)}</div></div>`;
        });
    },

    renderAgenda: function() {
        const apps = DB.get('appointments');
        const fDate = document.getElementById('filter-date').value;
        const fStatus = document.getElementById('filter-status').value;
        const tbody = document.getElementById('agenda-table-body');
        
        let filtered = apps.filter(a => a.date === fDate);
        if(fStatus !== 'ALL') filtered = filtered.filter(a => a.status === fStatus);
        
        filtered.sort((a, b) => String(a.time).localeCompare(String(b.time)));

        tbody.innerHTML = filtered.length ? '' : `<tr><td colspan="6" style="text-align:center;">Nenhum agendamento encontrado.</td></tr>`;
        
        filtered.forEach(app => {
            let badgeCls = app.status.toLowerCase();
            tbody.innerHTML += `
                <tr>
                    <td><strong>${app.time}</strong><br><small>${app.duration}m</small></td>
                    <td><strong>${app.clientName}</strong><br><small>${app.clientPhone}</small></td>
                    <td>${app.serviceName}<br><strong style="color: var(--purple);">${UI.formatCurrency(app.price)}</strong></td>
                    <td>${app.barberName}</td>
                    <td><span class="badge ${badgeCls}">${app.status}</span></td>
                    <td>
                        <div class="action-group">
                            ${app.status !== 'Concluido' && app.status !== 'Cancelado' ? `<button class="btn-action ok" onclick="Admin.changeStatus('${app.id}', 'Concluido')">✔ Pago</button>` : ''}
                            ${app.status === 'Pendente' ? `<button class="btn-action confirm" onclick="Admin.changeStatus('${app.id}', 'Confirmado')">Conf.</button>` : ''}
                            ${app.status !== 'Faltou' && app.status !== 'Concluido' ? `<button class="btn-action cancel" onclick="Admin.changeStatus('${app.id}', 'Faltou')">Faltou</button>` : ''}
                        </div>
                    </td>
                </tr>`;
        });
    },

    changeStatus: function(id, status) {
        DB.update('appointments', id, { status });
        if(status === 'Faltou') {
            const app = DB.get('appointments').find(a => String(a.id) === String(id));
            if(app) CRM.registerNoShow(app.clientId);
        }
        this.init();
        UI.toast(`Status atualizado para: ${status}`);
    },

    renderCRM: function() {
        const clients = DB.get('clients');
        const tbody = document.getElementById('crm-table-body');
        tbody.innerHTML = '';
        clients.sort((a,b) => parseInt(b.visits) - parseInt(a.visits)).forEach(c => {
            tbody.innerHTML += `
                <tr>
                    <td><strong>${c.name}</strong><br><small>${c.phone}</small></td>
                    <td>${c.visits}</td>
                    <td style="color: ${parseInt(c.noShows) > 1 ? '#dc3545' : 'inherit'}">${c.noShows}</td>
                    <td>${UI.formatDateBR(c.lastVisit)}</td>
                </tr>`;
        });
    },

    renderServices: function() {
        const tbody = document.getElementById('services-table-body');
        tbody.innerHTML = '';
        DB.get('services').forEach(s => {
            tbody.innerHTML += `
                <tr>
                    <td><strong>${s.name}</strong></td>
                    <td>${s.duration} min</td>
                    <td>${UI.formatCurrency(s.price)}</td>
                    <td>
                        <div class="action-group">
                            <button class="btn-action edit" onclick="Admin.editServicePrice('${s.id}')">✏️ Valor</button>
                            <button class="btn-action cancel" onclick="Admin.deleteService('${s.id}')">🗑️</button>
                        </div>
                    </td>
                </tr>`;
        });
    },
    addService: function() {
        const name = prompt("Nome do Serviço:"); if(!name) return;
        const price = parseFloat(prompt("Preço (ex: 50.00):")); if(isNaN(price)) return;
        const duration = parseInt(prompt("Duração em minutos (ex: 30, 45, 60):")); if(isNaN(duration)) return;
        DB.insert('services', { name, price, duration, desc: 'Adicionado via Painel' });
        this.init();
        UI.toast("Serviço adicionado!");
    },
    editServicePrice: function(id) {
        const srvs = DB.get('services');
        const index = srvs.findIndex(s => String(s.id) === String(id));
        if(index !== -1) {
            const novoPreco = parseFloat(prompt(`Digite o NOVO VALOR para "${srvs[index].name}":`, srvs[index].price));
            if(!isNaN(novoPreco)) {
                DB.update('services', id, { price: novoPreco });
                this.init();
                UI.toast("Preço atualizado na Planilha e no Site!");
            }
        }
    },
    deleteService: function(id) {
        if(confirm("Remover serviço?")) { DB.delete('services', id); this.init(); }
    },

    renderTeam: function() {
        const list = document.getElementById('team-list');
        const bSelect = document.getElementById('block-barber');
        list.innerHTML = ''; bSelect.innerHTML = '<option value="ALL">Barbearia Toda</option>';
        
        DB.get('barbers').forEach(b => {
            list.innerHTML += `<li>${b.name} <button class="btn-delete" onclick="Admin.deleteBarber('${b.id}')">Remover</button></li>`;
            bSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`;
        });

        const blockList = document.getElementById('blocks-list');
        blockList.innerHTML = '';
        DB.get('blocks').forEach(blk => {
            let bName = blk.barberId === 'ALL' ? 'Todos' : DB.get('barbers').find(x => String(x.id) === String(blk.barberId))?.name;
            blockList.innerHTML += `<li>🔒 ${UI.formatDateBR(blk.date)} - ${bName} <button class="btn-delete" onclick="Admin.removeBlock('${blk.id}')">Remover</button></li>`;
        });
    },
    addBarber: function() {
        const name = document.getElementById('new-barber-name').value;
        if(name) { DB.insert('barbers', { name, active: true }); document.getElementById('new-barber-name').value = ''; this.init(); }
    },
    deleteBarber: function(id) { if(confirm("Remover profissional?")) { DB.delete('barbers', id); this.init(); } },
    addBlock: function() {
        const date = document.getElementById('block-date').value;
        const barberId = document.getElementById('block-barber').value;
        if(date) { DB.insert('blocks', { date, barberId: barberId === 'ALL' ? 'ALL' : barberId }); this.init(); UI.toast("Dia Bloqueado!");}
    },
    removeBlock: function(id) { DB.delete('blocks', id); this.init(); },

    submitMockBooking: function() {
        const barbers = DB.get('barbers');
        const services = DB.get('services');
        if (barbers.length === 0 || services.length === 0) return alert("Adicione barbeiros e serviços primeiro.");

        const client = CRM.registerOrUpdate("João Teste (Mock)", "41999999999");
        const srv = services[0];
        const brb = barbers[0];

        const newAppt = {
            clientId: client.id,
            barberId: brb.id,
            serviceId: srv.id,
            clientName: client.name,
            clientPhone: client.phone,
            serviceName: srv.name,
            barberName: brb.name,
            date: document.getElementById('filter-date').value || new Date().toISOString().split("T")[0],
            time: '14:00',
            duration: srv.duration,
            price: srv.price,
            payment: 'PIX',
            status: 'Pendente',
            createdAt: new Date().toISOString()
        };
        DB.insert('appointments', newAppt);
        this.init();
        UI.toast('Agendamento teste injetado na agenda!');
    }
};

/* =========================================================
   MÓDULO 6: GERADOR PIX
   ========================================================= */
const PixHelper = {
    formatField: (id, value) => { const v = String(value); return `${id}${v.length.toString().padStart(2, '0')}${v}`; },
    generate: function(key, name, city, value) {
        let payload = "000201" + this.formatField("26", this.formatField("00", "br.gov.bcb.pix") + this.formatField("01", key));
        payload += "520400005303986" + this.formatField("54", value.toFixed(2)) + "5802BR" + this.formatField("59", name) + this.formatField("60", city);
        payload += this.formatField("62", this.formatField("05", "PK" + Date.now().toString().slice(-6))) + "6304";
        
        let crc = 0xFFFF;
        for (let i = 0; i < payload.length; i++) {
            crc ^= payload.charCodeAt(i) << 8;
            for (let j = 0; j < 8; j++) crc = (crc & 0x8000) > 0 ? (crc << 1) ^ 0x1021 : crc << 1;
        }
        return payload + (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    },
    copyCode: function() {
        const input = document.getElementById("pix-copia-cola");
        input.select(); document.execCommand("copy");
        
        const btn = document.querySelector('.btn-copy');
        btn.innerText = "Copiado!";
        btn.style.background = "#25D366";
        btn.style.color = "#000";
        setTimeout(() => { 
            btn.innerText = "Copiar"; 
            btn.style.background = "var(--text-main)"; 
            btn.style.color = "var(--black)"; 
        }, 3000);
        
        UI.toast("Código PIX copiado!");
    }
};

/* =========================================================
   INICIALIZAÇÃO DO SISTEMA, ANIMAÇÕES E PARTÍCULAS
   ========================================================= */

// Função para ativar as animações de surgimento (Reveal)
function reveal() {
    var reveals = document.querySelectorAll(".reveal");
    for (var i = 0; i < reveals.length; i++) {
        var windowHeight = window.innerHeight;
        var elementTop = reveals[i].getBoundingClientRect().top;
        var elementVisible = 100; // Ponto de disparo (em pixels)
        if (elementTop < windowHeight - elementVisible) {
            reveals[i].classList.add("active");
        }
    }
}
window.addEventListener("scroll", reveal);

document.addEventListener('DOMContentLoaded', () => {
    // Inicia DB
    DB.initLocalFallback();
    UI.renderCatalog();
    DB.syncDown();

    // Inicia sistema de Reveal na hora de carregar a página
    reveal();

    // Checa se é Admin
    if(sessionStorage.getItem('pk_admin_auth') === 'true') {
        document.getElementById('public-view').style.display = 'none';
        document.getElementById('admin-view').style.display = 'flex';
        Admin.init();
    }

    // ==================================================
    // CONFIGURAÇÃO DO BACKGROUND DE PARTÍCULAS
    // ==================================================
    if(typeof particlesJS !== 'undefined' && document.getElementById('particles-js')) {
        particlesJS("particles-js", {
          "particles": {
            "number": { "value": 50, "density": { "enable": true, "value_area": 800 } },
            "color": { "value": "#9b5de5" }, // Cor Roxo Neon
            "shape": { "type": "circle" },
            "opacity": { "value": 0.5, "random": true, "anim": { "enable": true, "speed": 1, "opacity_min": 0.1, "sync": false } },
            "size": { "value": 3, "random": true, "anim": { "enable": false, "speed": 40, "size_min": 0.1, "sync": false } },
            "line_linked": { "enable": true, "distance": 150, "color": "#9b5de5", "opacity": 0.4, "width": 1 },
            "move": { "enable": true, "speed": 2, "direction": "none", "random": false, "straight": false, "out_mode": "out", "bounce": false, "attract": { "enable": false, "rotateX": 600, "rotateY": 1200 } }
          },
          "interactivity": {
            "detect_on": "canvas",
            "events": { "onhover": { "enable": true, "mode": "grab" }, "onclick": { "enable": true, "mode": "push" }, "resize": true },
            "modes": { "grab": { "distance": 140, "line_linked": { "opacity": 1 } }, "bubble": { "distance": 400, "size": 40, "duration": 2, "opacity": 8, "speed": 3 }, "repulse": { "distance": 200, "duration": 0.4 }, "push": { "particles_nb": 4 }, "remove": { "particles_nb": 2 } }
          },
          "retina_detect": true
        });
    }
});
