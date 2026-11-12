/*
 * MMM-TamTramBus — Montpellier trams & buses from the TamTramBus API.
 * mode "departures": next departures at your stops, with the vehicle coming.
 * mode "journeys": your saved trips (from home to a few places), when to leave.
 */
Module.register("MMM-TamTramBus", {
	defaults: {
		apiUrl: "https://tamtrambus.bounsbot.com",
		mode: "departures",          // "departures" | "journeys"
		// departures
		stops: [],                   // stop codes, e.g. ["41143", "9234"]
		lineBlacklist: [],           // lines to hide, e.g. ["4", "Amigo"]
		maxTimes: 3,                 // departures shown per line and direction
		showAlerts: true,            // disruptions on the lines shown
		// journeys
		from: "",                    // address, stop code or "lat,lng"
		destinations: [],            // [{ name: "Odysseum" }, { name: "Apollo", to: "S9142", arriveBy: "18:00" }]
		// both
		showVehicles: true,          // picture of the tram / bus coming
		updateInterval: 60 * 1000,   // API refresh (ms); minutes left are recomputed every 15 s
	},

	getStyles() { return ["MMM-TamTramBus.css"]; },
	getTemplate() { return "templates/" + (this.config.mode === "journeys" ? "journeys" : "departures") + ".njk"; },
	getTranslations() { return { fr: "translations/fr.json", en: "translations/en.json" }; },

	start() {
		this.data_ = null;
		if (this.config.mode === "journeys" && this.config.updateInterval < 120000) this.config.updateInterval = 120000;
		this.sendSocketNotification("TTB_START", { id: this.identifier, config: this.config });
		this.tick = setInterval(() => { if (this.data_) this.updateDom(0); }, 15 * 1000);
	},

	socketNotificationReceived(notification, payload) {
		if (notification !== "TTB_DATA" || payload.id !== this.identifier) return;
		const first = !this.data_;
		this.data_ = payload.data;
		this.updateDom(first ? 500 : 0);
	},

	getTemplateData() {
		if (!this.data_) return { loading: true };
		const now = Date.now();
		return this.config.mode === "journeys" ? this.journeysView(this.data_, now) : this.departuresView(this.data_, now);
	},

	// ─── formatting ───────────────────────────────────────────────

	hhmm(ms) {
		const d = new Date(ms);
		return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
	},

	mins(ms, now) { return Math.max(0, Math.round((ms - now) / 60000)); },

	vehicleImg(v) {
		if (!v) return null;
		return { src: this.file("vehicles/" + v.key + ".png"), tram: /^(alstom|caf)/.test(v.key) };
	},

	badge(line) {
		const hex = (line.color || "#666666").replace("#", "");
		const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) || 0);
		return {
			n: line.n,
			color: line.color,
			shape: line.mode === "bus" ? "bus" : line.mode === "trambus" ? "trambus" : "tram",
			dark: 0.299 * r + 0.587 * g + 0.114 * b > 186, // light badge (yellow lines) → black number
		};
	},

	departuresView(data, now) {
		const stops = data.stops.map((s) => {
			const rows = s.rows.map((r) => {
				const times = r.times.filter((t) => t > now - 30000);
				if (!times.length) return null;
				const m = times.map((t) => this.mins(t, now));
				const label = (i) => (m[i] >= 60 ? this.hhmm(times[i]) : String(m[i]));
				return {
					badge: this.badge(r.line),
					headsign: r.headsign,
					first: m[0] <= 1 ? this.translate("NEAR") : m[0] >= 60 ? this.hhmm(times[0]) : m[0] + " min",
					next: m.slice(1).map((_, i) => label(i + 1)).join(" · "),
					img: this.vehicleImg(r.vehicle),
				};
			}).filter(Boolean);
			return { name: s.name, rows };
		});
		return {
			stops,
			alerts: (data.alerts || []).map((a) => ({ badges: a.lines.map((l) => this.badge(l)), title: a.title, period: a.period })),
		};
	},

	journeysView(data, now) {
		return {
			destinations: data.destinations.map((d) => {
				const trips = d.trips.filter((t) => t.dep > now - 30000);
				const main = trips[0];
				const walk = d.walk && d.walk.dep > now - 30000 ? d.walk : null;
				const v = { name: d.name, arriveBy: d.arriveBy, walk: walk ? { dep: this.hhmm(walk.dep), mins: Math.round(walk.durationS / 60) } : null };
				if (!main) return v;
				const leave = this.mins(main.dep, now);
				return Object.assign(v, {
					leave: leave === 0 ? this.translate("LEAVE_NOW") : leave >= 60 ? this.translate("LEAVE_AT", { time: this.hhmm(main.dep) }) : this.translate("LEAVE_IN", { time: leave + " min" }),
					dep: this.hhmm(main.dep),
					arr: this.hhmm(main.arr),
					duration: Math.round(main.durationS / 60),
					transfers: main.transfers,
					badges: main.lines.map((l) => this.badge(l)),
					board: main.board.stop + " · " + this.hhmm(main.board.at),
					changes: main.changes.length ? this.translate("CHANGE_AT", { stop: main.changes.join(", ") }) : null,
					others: trips.slice(1, 3).map((t) => this.hhmm(t.dep)).join(" · "),
					img: this.vehicleImg(main.vehicle),
				});
			}),
		};
	},
});
