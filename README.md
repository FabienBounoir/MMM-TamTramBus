# MMM-TamTramBus

Module [MagicMirror²](https://magicmirror.builders) pour les trams et bus de Montpellier (TaM), branché sur l'API [TamTramBus](https://tamtrambus.bounsbot.com) : temps réel, véhicule qui arrive, perturbations, et trajets enregistrés.

Deux modes, une instance par mode (ou plusieurs) :

- **`departures`** : les prochains passages à vos arrêts, avec l'image du tram ou du bus qui arrive (le vrai véhicule quand il est connu en temps réel, sinon celui de la ligne) et les perturbations de vos lignes.
- **`journeys`** : vos trajets enregistrés depuis chez vous, avec l'heure à laquelle partir, correspondances comprises. Possibilité de viser une heure d'arrivée.

Les minutes restantes sont recalculées toutes les 15 secondes à partir des horaires exacts ; l'API est interrogée chaque minute (deux minutes pour les trajets). En cas de coupure, les derniers horaires reçus restent affichés.

## Installation

```sh
cd ~/MagicMirror/modules
git clone https://github.com/FabienBounoir/MMM-TamTramBus.git
```

Aucune dépendance (Node 18 ou plus).

## Configuration

```js
{
	module: "MMM-TamTramBus",
	position: "top_left",
	header: "TAM Montpellier",
	config: {
		mode: "departures",
		stops: ["41143", "9234", "9249"],
		lineBlacklist: ["4", "Amigo"]
	}
},
{
	module: "MMM-TamTramBus",
	position: "top_left",
	header: "Mes trajets",
	config: {
		mode: "journeys",
		from: "1 rue de la Loge, Montpellier",
		destinations: [
			{ name: "Odysseum" },
			{ name: "Apollo" },
			{ name: "Comédie", arriveBy: "18:00" }
		]
	}
}
```

| Option | Défaut | Description |
| --- | --- | --- |
| `mode` | `"departures"` | `"departures"` ou `"journeys"` |
| `stops` | `[]` | Codes d'arrêt (ceux de la TaM, ou les `id` renvoyés par `/v1/search`) |
| `lineBlacklist` | `[]` | Lignes à masquer |
| `maxTimes` | `3` | Passages affichés par ligne et direction |
| `showAlerts` | `true` | Perturbations des lignes affichées |
| `from` | `""` | Point de départ des trajets : adresse, code d'arrêt ou `"lat,lng"` |
| `destinations` | `[]` | `{ name, to?, arriveBy? }` : `to` = nom d'arrêt, code ou `"lat,lng"` (par défaut `name`), `arriveBy` = `"HH:MM"` |
| `showVehicles` | `true` | Image du véhicule (tram : l'avant seulement, bus : en entier) |
| `updateInterval` | `60000` | Rafraîchissement de l'API (ms) |
| `apiUrl` | `"https://tamtrambus.bounsbot.com"` | Adresse de l'API |

Pour trouver un code d'arrêt : `https://tamtrambus.bounsbot.com/v1/search?q=Comédie`.
Les passages qui arrivent en terminus à votre arrêt sont ignorés.

## Test

```sh
node test.js
```

## Licence

MIT
