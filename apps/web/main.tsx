import { useState } from "react";
import type { FormEvent } from "react";
import { createRoot } from "react-dom/client";
import type { Action, SafetyView } from "../../packages/application/safety-sheets.ts";
import type { Profile } from "../../packages/domain/safety-sheet.ts";
import "./style.css";

type Access = { outing: string; token: string };
type Submission = { action: Action; token: string; key: string };
type Member = { id: string; firstName: string; lastName: string };
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined ?? "").replace(/\/$/, "");

const errors: Record<string, string> = {
  unauthenticated: "Jeton invalide ou expiré.",
  forbidden: "Cette feuille est réservée au DP désigné pour la sortie.",
  not_found: "Sortie ou participant introuvable.",
  invalid_request: "Vérifiez les informations saisies.",
  locked: "Cette sortie est réservée à un appareil DP.",
  outing_state: "L’état de la sortie ne permet pas de modifier cette feuille.",
  stale: "Des données ont changé. Consultez les informations actualisées avant de confirmer.",
  no_confirmed: "La sortie doit avoir au moins un inscrit confirmé.",
  duplicate: "La feuille ou le participant existe déjà.",
  key_reused: "Cette demande a déjà été utilisée pour une autre opération.",
};

const alerts: Record<string, string> = {
  held_level_missing: "Niveau détenu manquant",
  caci_missing: "CACI manquant",
  caci_after_outing: "CACI daté après le début de la sortie",
  caci_unverified: "Validité du CACI à vérifier",
};

const fields = { heldLevel: "Niveau détenu", qualifications: "Qualifications", lastCaci: "Dernier CACI" };
const fullName = (profile: { firstName: string; lastName: string }) => `${profile.firstName} ${profile.lastName}`;
const showValue = (value: string | string[] | null) => (Array.isArray(value) ? value.join(", ") : value) || "Non renseigné";

class RequestError extends Error {
  readonly status: number;

  constructor(status: number, code: string) {
    super(errors[code] ?? "Le serveur a rencontré un problème.");
    this.status = status;
  }
}

async function request<T>(access: Access, options?: RequestInit, suffix = ""): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/api/sorties/${encodeURIComponent(access.outing)}/feuille-securite${suffix}`, {
    ...options,
    headers: { Authorization: `Bearer ${access.token}`, ...options?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new RequestError(response.status, body.error);
  }
  return response.json();
}

function Proposal({ change, apply }: { change: SafetyView["changes"][number]; apply: (action: Action) => void }) {
  const { candidate } = change;
  const name = fullName(candidate.profile);
  if (change.kind === "cancelled") return <li>{name} — inscription annulée. Le DP peut retirer ce participant s’il le décide.</li>;
  if (change.kind === "refresh") {
    const { field, participantId } = change;
    return <li>
      <strong>{name}</strong> · {fields[field]} · {showValue(change.before[field])} → {showValue(candidate.profile[field])}
      <button onClick={() => apply({ kind: "refresh", registrationId: candidate.id, participantId, field })}>Approuver ce changement</button>
    </li>;
  }
  if (change.kind === "link") {
    const { participantId } = change;
    return <li>{name} — inscription confirmée après ajout manuel
      <button onClick={() => apply({ kind: "link", registrationId: candidate.id, participantId })}>Rattacher l’inscription</button>
    </li>;
  }
  return <li>{name} — nouvelle inscription confirmée
    <Warnings warnings={change.warnings} />
    <button onClick={() => apply({ kind: "import", registrationId: candidate.id })}>Importer</button>
  </li>;
}

function Warnings({ warnings }: { warnings: string[] }) {
  return warnings.length > 0 && <ul className="alerts">{warnings.map(value => <li key={value}>{alerts[value]}</li>)}</ul>;
}

function ProfileDetails({ profile, warnings }: { profile: Profile; warnings: string[] }) {
  return <>
    <strong>{fullName(profile)}</strong>
    <div>{fields.heldLevel} · {showValue(profile.heldLevel)}</div>
    <div>{fields.qualifications} · {showValue(profile.qualifications)}</div>
    <div>{fields.lastCaci} · {showValue(profile.lastCaci)}</div>
    <Warnings warnings={warnings} />
  </>;
}

function AddParticipant({ access, apply }: { access: Access; apply: (action: Action) => Promise<boolean> }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [message, setMessage] = useState("");
  const [searching, setSearching] = useState(false);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    setMessage("");
    setMembers([]);
    setSearching(true);
    try {
      const found = await request<Member[]>(access, undefined, `/adherents?nom=${encodeURIComponent(name)}`);
      setMembers(found);
      if (!found.length) setMessage("Aucun adhérent trouvé.");
    } catch (error) {
      setMessage(error instanceof RequestError ? error.message : "Recherche indisponible.");
    } finally {
      setSearching(false);
    }
  }

  async function addGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const text = (field: string) => String(values.get(field) ?? "").trim();
    const added = await apply({
      kind: "add_guest",
      verified: true,
      profile: {
        firstName: text("firstName"), lastName: text("lastName"),
        heldLevel: text("heldLevel") || null, lastCaci: text("lastCaci") || null,
        qualifications: text("qualifications").split(",").map(value => value.trim()).filter(Boolean),
      },
    });
    if (added) form.reset();
  }

  return <section aria-labelledby="add-title">
    <h2 id="add-title">Ajouter un participant</h2>
    <details>
      <summary>Adhérent</summary>
      <form onSubmit={search}>
        <label>Nom ou prénom<input name="name" minLength={2} maxLength={100} required /></label>
        <button disabled={searching}>Rechercher</button>
      </form>
      {message && <p role="status">{message}</p>}
      {members.length > 0 && <ul>{members.map(member => <li key={member.id}>{fullName(member)}
        <button onClick={() => void apply({ kind: "add_member", memberId: member.id })}>Ajouter</button>
      </li>)}</ul>}
    </details>
    <details>
      <summary>Invité non adhérent</summary>
      <form onSubmit={addGuest}>
        <label>Prénom<input name="firstName" maxLength={100} required /></label>
        <label>Nom<input name="lastName" maxLength={100} required /></label>
        <label>Niveau détenu<input name="heldLevel" maxLength={100} /></label>
        <label>Qualifications utiles (séparées par une virgule)<input name="qualifications" maxLength={500} /></label>
        <label>Date du dernier CACI<input type="date" name="lastCaci" /></label>
        <label className="checkbox"><input type="checkbox" required /> J’ai vérifié les informations renseignées pour cet invité.</label>
        <button>Ajouter l’invité</button>
      </form>
    </details>
  </section>;
}

function SheetPage({ access, initial, disconnect }: { access: Access; initial: SafetyView; disconnect: () => void }) {
  const [view, setView] = useState(initial);
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState<Submission | null>(null);
  const [message, setMessage] = useState("");
  const [workStale, setWorkStale] = useState(false);

  async function reload() {
    try {
      setView(await request<SafetyView>(access));
      setWorkStale(false);
      return true;
    } catch (error) {
      setMessage(error instanceof RequestError ? error.message : "Actualisation indisponible. Réessayez après reconnexion.");
      setWorkStale(true);
      return false;
    }
  }

  async function submit(command: Submission) {
    setPending(true);
    setMessage("");
    try {
      await request(access, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": command.key },
        body: JSON.stringify({ token: command.token, action: command.action }),
      });
      setRetry(null);
      if (await reload()) setMessage("Modification enregistrée.");
      return true;
    } catch (error) {
      if (error instanceof RequestError && error.status < 500) {
        setRetry(null);
        if ([403, 409, 423].includes(error.status)) await reload();
        setMessage(error.message);
      } else {
        setRetry(command);
        setMessage("Enregistrement à confirmer. Réessayez la même demande après reconnexion.");
      }
      return false;
    } finally {
      setPending(false);
    }
  }

  const apply = (action: Action) => submit({ action, token: view.token, key: crypto.randomUUID() });

  return <>
    <div className="toolbar">
      <p>Sortie du <time dateTime={view.startsOn}>{view.startsOn}</time></p>
      <button onClick={disconnect}>Fermer la feuille</button>
    </div>
    <button disabled={pending || !!retry} onClick={async () => {
      setPending(true);
      setMessage("");
      await reload();
      setPending(false);
    }}>Actualiser</button>
    {message && <p role="status">{message}</p>}
    {retry && <button disabled={pending} onClick={() => void submit(retry)}>Réessayer la demande</button>}
    {!view.canWrite && <p>Feuille en lecture seule pour cette sortie.</p>}
    <fieldset disabled={pending || !!retry || workStale || !view.canWrite}>
      {view.revision === 0 ? <section>
        <h2>Inscrits confirmés</h2>
        {view.confirmed.length === 0 ? <p>Aucun inscrit confirmé.</p> : <ul className="participants">
          {view.confirmed.map(candidate => <li key={candidate.id}><ProfileDetails {...candidate} /></li>)}
        </ul>}
        <button disabled={view.confirmed.length === 0} onClick={() => void apply({ kind: "initialize" })}>Initialiser la feuille de sécurité</button>
      </section> : <>
        <section>
          <h2>Participants prévisionnels</h2>
          <ul className="participants">{view.participants.map(participant => <li key={participant.id}>
            <ProfileDetails profile={participant.snapshot.profile} warnings={participant.warnings} />
            {participant.origin === "guest" && <div>Invité · vérification DP consignée</div>}
            {participant.removed && <div>Retiré par le DP</div>}
            <button onClick={() => void apply({ kind: participant.removed ? "restore" : "remove", participantId: participant.id })}>
              {participant.removed ? "Rétablir" : "Retirer"}
            </button>
          </li>)}</ul>
        </section>
        <section>
          <h2>Écarts à examiner</h2>
          {view.changes.length === 0 ? <p>Aucun écart.</p> : <ul className="participants">{view.changes.map(change =>
            <Proposal key={`${change.candidate.id}:${change.kind}:${change.kind === "refresh" ? change.field : ""}`} change={change} apply={apply} />,
          )}</ul>}
        </section>
        <AddParticipant access={access} apply={apply} />
      </>}
    </fieldset>
  </>;
}

function App() {
  const [session, setSession] = useState<{ access: Access; view: SafetyView } | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const access = { outing: String(form.get("outing")).trim(), token: String(form.get("token")).trim() };
    setMessage("");
    setPending(true);
    try {
      setSession({ access, view: await request<SafetyView>(access) });
    } catch (error) {
      setMessage(error instanceof RequestError ? error.message : "Connexion indisponible.");
    } finally {
      setPending(false);
    }
  }

  return <main>
    <header><h1>Feuille de sécurité</h1></header>
    {session ? <SheetPage access={session.access} initial={session.view} disconnect={() => setSession(null)} />
      : <form onSubmit={connect}>
        <label>Identifiant de la sortie<input name="outing" autoComplete="off" required /></label>
        <label>Jeton d’accès DP<input name="token" type="password" autoComplete="off" required /></label>
        <button disabled={pending}>Ouvrir la sortie</button>
        {message && <p role="alert">{message}</p>}
      </form>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
