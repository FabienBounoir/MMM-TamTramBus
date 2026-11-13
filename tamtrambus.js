// Pure helpers (no I/O), used by node_helper.js and test.js.

// Fleet number → vehicle illustration (same mapping as the TamTramBus app, lib/vehiclePhotos.ts).
function photoKey(id) {
	if (id >= 2001 && id <= 2030) return "alstom-401-l1";
	if ((id >= 2031 && id <= 2033) || (id >= 2041 && id <= 2045)) return "alstom-302-l4";
	if (id >= 2046 && id <= 2049) return "alstom-302-multiligne";
	if (id >= 2050 && id <= 2064) return "alstom-302-l2";
	if ((id >= 2070 && id <= 2072) || (id >= 2090 && id <= 2092) || id === 2098 || id === 2099) return "alstom-402-multiligne";
	if (id >= 2073 && id <= 2089) return "alstom-402-l3";
	if (id >= 2093 && id <= 2097) return "alstom-402-l2";
	if (id === 2102 || (id >= 2124 && id <= 2130)) return "caf-100-x-multiligne";
	if ((id >= 2113 && id <= 2114) || (id >= 2122 && id <= 2123)) return "caf-100-x-multiligne-blanche";
	if ((id >= 2101 && id <= 2112) || (id >= 2115 && id <= 2121)) return "caf-100-x-l5";
	if (id >= 701 && id <= 712) return "bustram";
	if (id === 160 || (id >= 163 && id <= 201)) return "citelis-gaz-tam";
	if (id >= 202 && id <= 285 && id !== 233) return "urbanway-c8-tam";
	if (id >= 286 && id <= 293) return "urbanway-c9-tam";
	if (id >= 21 && id <= 23) return "urbanway-18-c8-tam";
	if (id === 24) return "urbanway-18-c9-tam";
	if ((id >= 642 && id <= 650) || id === 653 || id === 880) return "citaro-facelift-tam";
	if (id >= 655 && id <= 659) return "citaro-c2-tam";
	if (id === 676 || id === 910) return "citelis-tam";
	if (id === 680 || id === 697 || id === 699 || id === 6180 || (id >= 771 && id <= 772) || (id >= 906 && id <= 909)) return "iveco-crossway-le-city-facelift-tam";
	if ((id >= 731 && id <= 733) || (id >= 735 && id <= 736) || id === 759 || (id >= 761 && id <= 764) || (id >= 766 && id <= 768) || id === 775 || (id >= 780 && id <= 782) || id === 867) return "gx327-tam";
	if (id === 740 || id === 742) return "urbino-12-lll-3p-blanc";
	if (id === 741) return "urbino-12-lll-2p-tam";
	if (id >= 743 && id <= 745) return "urbino-12-lll-3p-tam";
	if (id === 698 || id === 773 || (id >= 809 && id <= 810) || id === 864 || id === 866 || (id >= 872 && id <= 874)) return "iveco-crossway-le-city-tam";
	if ((id >= 807 && id <= 808) || id === 811) return "setra-s415NFU-tam";
	if (id >= 861 && id <= 863) return "citelis-gaz-tam";
	if (id === 881) return "setra-s416-le-business-blanc";
	return null;
}

// Usual vehicle of a line, when the one running the trip isn't known yet.
const TRAM_BY_LINE = { 1: "alstom-401-l1", 2: "alstom-302-l2", 3: "alstom-402-l3", 4: "alstom-302-l4", 5: "caf-100-x-l5" };
function lineVehicle(line) {
	if (!line) return null;
	if (line.mode === "tram") return TRAM_BY_LINE[line.id] || "alstom-402-multiligne";
	if (line.mode === "trambus") return "bustram";
	if (line.mode === "bus" && (line.network || "tam") === "tam") return "urbanway-c8-tam";
	return null;
}

function vehicleFor(tripIds, vehiclesByTrip, line) {
	for (const t of tripIds || []) {
		const v = vehiclesByTrip[t];
		const key = v && photoKey(Number.parseInt(v.id, 10));
		if (key) return { key, id: v.id, live: true };
	}
	const key = lineVehicle(line);
	return key ? { key, id: null, live: false } : null;
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// /v1/departures → [{ stop, rows: [{ line, headsign, times, realtime, vehicle }] }]
function buildDepartures(stopsResp, linesById, vehiclesByTrip, opts) {
	const blacklist = (opts.lineBlacklist || []).map(String);
	return stopsResp.map(({ stop, departures }) => ({
		id: stop.id,
		name: stop.name,
		rows: departures
			.filter((d) => !blacklist.includes(String(d.lineId)))
			// A bus ending at this very stop is arriving, not leaving.
			.filter((d) => norm(d.headsign) !== norm(stop.name))
			.map((d) => {
				const line = linesById[d.lineId] || { id: d.lineId, n: d.lineId, mode: "bus", color: "#666" };
				return {
					line: { id: line.id, n: line.n, mode: line.mode, color: line.color },
					headsign: d.headsign,
					times: d.times.slice().sort((a, b) => a - b).slice(0, opts.maxTimes || 3),
					realtime: !!d.realtime,
					vehicle: opts.showVehicles ? vehicleFor(d.tripIds, vehiclesByTrip, line) : null,
				};
			}),
	}));
}

// /v1/journeys → transit journeys, plus the best walk-only one apart.
function buildJourneys(journeys, linesById, vehiclesByTrip) {
	const out = { trips: [], walk: null };
	for (const j of journeys) {
		const transit = j.legs.filter((l) => l.kind !== "walk");
		if (!transit.length) {
			if (!out.walk || j.arrivalMs < out.walk.arr) out.walk = { dep: j.departureMs, arr: j.arrivalMs, durationS: j.durationS };
			continue;
		}
		const first = transit[0];
		out.trips.push({
			dep: j.departureMs,
			arr: j.arrivalMs,
			durationS: j.durationS,
			transfers: j.transfers,
			lines: transit.map((l) => {
				const line = linesById[l.lineId] || { id: l.lineId, n: l.lineId, mode: "bus", color: "#666" };
				return { id: line.id, n: line.n, mode: line.mode, color: line.color };
			}),
			changes: transit.slice(1).map((l) => l.from.name),
			board: { stop: first.from.name, at: first.departureMs, headsign: first.headsign },
			vehicle: vehicleFor([first.tripId], vehiclesByTrip, linesById[first.lineId]),
		});
	}
	out.trips.sort((a, b) => a.dep - b.dep);
	return out;
}

if (typeof module !== "undefined") module.exports = { photoKey, lineVehicle, vehicleFor, buildDepartures, buildJourneys, norm };
