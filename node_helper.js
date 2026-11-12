/*
 * MMM-TamTramBus — talks to the TamTramBus API (departures, vehicles, journeys).
 * Each module instance sends its config; answers go back with its identifier.
 */
const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const T = require("./tamtrambus.js");

const CACHE = path.join(__dirname, "cache.json");
const LINES_TTL = 6 * 3600 * 1000;

module.exports = NodeHelper.create({
	start() {
		this.timers = {};
		this.lines = null;
		this.linesAt = 0;
		this.places = {};
		try { this.cache = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch { this.cache = {}; }
		if (this.cache._places) this.places = this.cache._places;
	},

	socketNotificationReceived(notification, payload) {
		if (notification !== "TTB_START") return;
		const { id, config } = payload;
		if (this.cache[id]) this.sendSocketNotification("TTB_DATA", { id, data: this.cache[id], cached: true });
		clearInterval(this.timers[id]);
		const run = () => this.refresh(id, config);
		run();
		this.timers[id] = setInterval(run, config.updateInterval);
	},

	async get(config, route, params) {
		const url = new URL(config.apiUrl.replace(/\/$/, "") + route);
		Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
		const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "MMM-TamTramBus" } });
		if (!res.ok) throw new Error(route + " → HTTP " + res.status);
		return res.json();
	},

	async linesById(config) {
		if (!this.lines || Date.now() - this.linesAt > LINES_TTL) {
			const list = await this.get(config, "/v1/lines");
			this.lines = Object.fromEntries((Array.isArray(list) ? list : list.lines).map((l) => [l.id, l]));
			this.linesAt = Date.now();
		}
		return this.lines;
	},

	async vehiclesByTrip(config) {
		const list = await this.get(config, "/v1/vehicles");
		return Object.fromEntries(list.filter((v) => v.tripId).map((v) => [v.tripId, v]));
	},

	// "S9142", "41143", "43.6,3.89" are used as is; a name is looked up as a stop
	// (destinations), an address is geocoded (origin). Resolved once, then cached.
	async place(config, text, kind) {
		if (/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(text) || /^S?[\w:]*\d+$/.test(text)) return text.replace(/\s/g, "");
		const key = kind + ":" + text;
		if (this.places[key]) return this.places[key];
		let found = null;
		if (kind === "to") {
			const r = await this.get(config, "/v1/search", { q: text, limit: 5 });
			const stop = r.stops.find((s) => T.norm(s.name) === T.norm(text)) || r.stops[0];
			if (stop) found = stop.id;
		}
		if (!found) {
			const g = await this.get(config, "/v1/geocode", { q: text });
			if (g[0]) found = g[0].lat + "," + g[0].lng;
		}
		if (!found) throw new Error("lieu introuvable : " + text);
		this.places[key] = found;
		return found;
	},

	nextTime(hhmm) {
		const [h, m] = hhmm.split(":").map(Number);
		const d = new Date();
		d.setHours(h, m, 0, 0);
		if (d < Date.now()) d.setDate(d.getDate() + 1);
		return d.getTime();
	},

	async refresh(id, config) {
		try {
			const [lines, vehicles] = await Promise.all([this.linesById(config), config.showVehicles ? this.vehiclesByTrip(config) : {}]);
			let data;
			if (config.mode === "journeys") {
				const from = await this.place(config, config.from, "from");
				data = {
					destinations: await Promise.all(config.destinations.map(async (d) => {
						const params = { from, to: await this.place(config, d.to || d.name, "to"), limit: 5 };
						if (d.arriveBy) Object.assign(params, { at: this.nextTime(d.arriveBy), arriveBy: "true" });
						const r = await this.get(config, "/v1/journeys", params);
						return Object.assign({ name: d.name, arriveBy: d.arriveBy || null }, T.buildJourneys(r.journeys, lines, vehicles));
					})),
				};
			} else {
				const stops = await this.get(config, "/v1/departures", { stops: config.stops.join(",") });
				data = { stops: T.buildDepartures(stops, lines, vehicles, config) };
				if (config.showAlerts) {
					const shown = new Set(data.stops.flatMap((s) => s.rows.map((r) => r.line.id)));
					const alerts = await this.get(config, "/v1/alerts");
					data.alerts = alerts
						.filter((a) => a.status !== "upcoming" && (a.lines || []).some((l) => shown.has(l)))
						.map((a) => ({ lines: a.lines.filter((l) => shown.has(l)).map((l) => lines[l] || { id: l, n: l, color: "#666" }), title: a.title, period: a.period }));
				}
			}
			this.cache[id] = data;
			this.cache._places = this.places;
			fs.writeFile(CACHE, JSON.stringify(this.cache), () => {});
			this.sendSocketNotification("TTB_DATA", { id, data });
		} catch (err) {
			console.error("[MMM-TamTramBus]", err.message);
			// Keep showing what we have: times already gone are dropped by the front end.
		}
	},
});
