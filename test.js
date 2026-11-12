// node test.js — offline checks of the data shaping and display logic.
const assert = require("assert");
const T = require("./tamtrambus.js");

// Vehicle pictures
assert.strictEqual(T.photoKey(2019), "alstom-401-l1");
assert.strictEqual(T.photoKey(288), "urbanway-c9-tam");
assert.strictEqual(T.photoKey(99999), null);
assert.strictEqual(T.lineVehicle({ id: "1", mode: "tram" }), "alstom-401-l1");
assert.strictEqual(T.lineVehicle({ id: "A", mode: "trambus" }), "bustram");
assert.strictEqual(T.lineVehicle({ id: "lio:620", mode: "bus", network: "lio" }), null);

const lines = {
	1: { id: "1", n: "1", mode: "tram", color: "#005CA9" },
	2: { id: "2", n: "2", mode: "tram", color: "#EF7D00" },
	4: { id: "4", n: "4", mode: "tram", color: "#4B2A0E" },
	14: { id: "14", n: "14", mode: "bus", color: "#F08178" },
};
const vehicles = { "trip-a": { id: "2019", tripId: "trip-a" }, "trip-x": { id: "208", tripId: "trip-x" } };
const now = Date.UTC(2026, 10, 12, 9, 0);
const min = (m) => now + m * 60000;

// Departures: blacklist, terminus arrivals dropped, vehicle from the trip or the line.
const deps = T.buildDepartures([
	{ stop: { id: "41143", name: "Place de l'Europe" }, departures: [
		{ lineId: "1", headsign: "Gare Sud de France", times: [min(0.5), min(8), min(6), min(15)], tripIds: ["trip-a"], realtime: true },
		{ lineId: "4", headsign: "Garcia Lorca A", times: [min(4)], tripIds: [], realtime: true },
	] },
	{ stop: { id: "9234", name: "Léon Blum" }, departures: [
		{ lineId: "14", headsign: "Léon Blum", times: [min(1)], tripIds: ["trip-x"] },
		{ lineId: "14", headsign: "Place de l'Europe", times: [min(9), min(29)], tripIds: ["unknown"] },
	] },
], lines, vehicles, { lineBlacklist: ["4"], maxTimes: 3, showVehicles: true });
assert.deepStrictEqual(deps.map((s) => s.rows.map((r) => r.headsign)), [["Gare Sud de France"], ["Place de l'Europe"]]);
assert.deepStrictEqual(deps[0].rows[0].vehicle, { key: "alstom-401-l1", id: "2019", live: true });
assert.deepStrictEqual(deps[1].rows[0].vehicle, { key: "urbanway-c8-tam", id: null, live: false });
assert.strictEqual(deps[0].rows[0].times.length, 3);

// Journeys: walk-only kept apart, transit sorted, change stops listed.
const leg = (lineId, from, to, d, a, tripId) => ({ kind: "transit", lineId, from: { name: from }, to: { name: to }, departureMs: min(d), arrivalMs: min(a), tripId });
const j = T.buildJourneys([
	{ departureMs: min(9), arrivalMs: min(38), durationS: 1740, transfers: 1, legs: [leg("1", "Place de l'Europe", "Comédie", 9, 19, "trip-a"), { kind: "walk", from: { name: "Comédie" }, to: { name: "Comédie" } }, leg("2", "Comédie", "Sabines", 23, 38)] },
	{ departureMs: min(4), arrivalMs: min(25), durationS: 1260, transfers: 0, legs: [{ kind: "walk", from: {}, to: {} }] },
	{ departureMs: min(5), arrivalMs: min(30), durationS: 1500, transfers: 0, legs: [leg("14", "Léon Blum", "Sabines", 5, 30)] },
], lines, vehicles);
assert.deepStrictEqual(j.trips.map((t) => t.dep), [min(5), min(9)]);
assert.deepStrictEqual(j.trips[1].changes, ["Comédie"]);
assert.deepStrictEqual(j.trips[1].lines.map((l) => l.n), ["1", "2"]);
assert.strictEqual(j.trips[1].vehicle.id, "2019");
assert.deepStrictEqual(j.walk, { dep: min(4), arr: min(25), durationS: 1260 });

// Front end formatting
let def;
global.Module = { register: (n, d) => { def = d; } };
require("./MMM-TamTramBus.js");
const fr = require("./translations/fr.json");
const mod = Object.assign(Object.create(def), {
	config: Object.assign({}, def.defaults),
	translate: (k, vars) => (fr[k] || k).replace(/\{(\w+)\}/g, (_, v) => (vars || {})[v]),
	file: (f) => "modules/MMM-TamTramBus/" + f,
});
const dv = mod.departuresView({ stops: deps }, now);
assert.strictEqual(dv.stops[0].rows[0].first, "Proche");
assert.strictEqual(dv.stops[0].rows[0].next, "6 · 8");
assert.strictEqual(dv.stops[1].rows[0].first, "9 min");
assert.strictEqual(dv.stops[0].rows[0].img.tram, true);
assert.strictEqual(dv.stops[1].rows[0].img.tram, false);
assert.strictEqual(mod.badge({ n: "21", mode: "bus", color: "#FFE500" }).dark, true);
assert.strictEqual(mod.badge(lines[1]).dark, false);

const jv = mod.journeysView({ destinations: [Object.assign({ name: "Sabines" }, j)] }, now);
assert.strictEqual(jv.destinations[0].leave, "Pars dans 5 min");
assert.strictEqual(jv.destinations[0].walk.mins, 21);
assert.strictEqual(mod.journeysView({ destinations: [Object.assign({ name: "Sabines" }, j)] }, min(20)).destinations[0].dep, undefined);

console.log("MMM-TamTramBus : OK");
