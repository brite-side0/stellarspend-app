/// <reference types="cypress" />

// ── Global type declarations ─────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Installs a deterministic mock of the Freighter browser extension on
       * `window.freighter`. Call after `cy.visit()` — the window is recreated
       * on every navigation, so the mock must be re-installed per visit.
       */
      mockFreighter(): Chainable<void>;
      /** Intercepts Stellar Horizon/Soroban calls the app makes while mocked. */
      mockStellarAPI(): Chainable<void>;
      /** Connects the mocked Freighter wallet via the navbar "Connect Wallet" button. */
      connectWallet(): Chainable<void>;
      /** Disconnects the connected Freighter wallet from the navbar menu. */
      disconnectWallet(): Chainable<void>;
      /** Fires the window `offline` event so OfflineProvider marks the app offline. */
      goOffline(): Chainable<void>;
      /** Fires the window `online` event so OfflineProvider marks the app online. */
      goOnline(): Chainable<void>;
    }
  }
  interface Window {
    freighter?: {
      isConnected: () => Promise<boolean>;
      getPublicKey: () => Promise<string>;
      getNetwork: () => Promise<string>;
      requestAccess: () => Promise<string>;
      signTransaction: (xdr: string, network?: string) => Promise<string>;
    };
  }
}

// ── Freighter wallet mock ────────────────────────────────────────────────────

/**
 * The deterministic public key used across the mocked flows. Must be a valid
 * 56-character Stellar address starting with "G".
 */
export const MOCK_PUBLIC_KEY =
  "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37";

Cypress.Commands.add("mockFreighter", () => {
  return cy.fixture("wallet").then((wallet) => {
    cy.window().then((win) => {
      win.freighter = {
        isConnected: () => Promise.resolve(wallet.isConnected),
        getPublicKey: () => Promise.resolve(wallet.publicKey),
        getNetwork: () => Promise.resolve(wallet.network),
        requestAccess: () => Promise.resolve(wallet.publicKey),
        signTransaction: (xdr: string) => Promise.resolve(xdr),
      };
    });
  });
});

Cypress.Commands.add("connectWallet", () => {
  cy.mockFreighter();
  cy.get('header[role="banner"]')
    .contains("button", "Connect Wallet")
    .click();
  // Connected state shows the truncated public key (first 6 + last 4 chars).
  cy.get('header[role="banner"]')
    .contains("button", "GDQP2K...4W37")
    .should("be.visible");
});

Cypress.Commands.add("disconnectWallet", () => {
  cy.get('header[role="banner"]')
    .find('button[aria-label="Wallet menu"]')
    .click();
  cy.contains("button", "Disconnect").click();
  cy.get('header[role="banner"]')
    .contains("button", "Connect Wallet")
    .should("be.visible");
});

// ── Connectivity helpers ─────────────────────────────────────────────────────

Cypress.Commands.add("goOffline", () => {
  // Dispatch as a native Event so the addEventListener handlers in
  // OfflineProvider fire correctly. Keep dispatching until the banner is
  // visible: on a slow first load the app may not have hydrated (and attached
  // its listeners) when the first dispatch fires, so a single one-shot event
  // can be lost. cy.contains retries the assertion underneath, so the banner
  // appears as soon as the listener is live.
  cy.window().then((win) => {
    const timer = setInterval(() => {
      win.dispatchEvent(new Event("offline"));
    }, 250);
    cy.contains("You are currently offline.").should("exist").then(() => {
      clearInterval(timer);
    });
  });
});

Cypress.Commands.add("goOnline", () => {
  cy.window().then((win) => {
    win.dispatchEvent(new Event("online"));
  });
});

// ── Stellar Horizon mock ─────────────────────────────────────────────────────

Cypress.Commands.add("mockStellarAPI", () => {
  return cy.fixture("transaction").then((transaction) => {
    cy.intercept("GET", "**/accounts/**", {
      statusCode: 200,
      body: {
        _links: {
          self: { href: `https://horizon-testnet.stellar.org/accounts/${MOCK_PUBLIC_KEY}` },
        },
        id: MOCK_PUBLIC_KEY,
        account_id: MOCK_PUBLIC_KEY,
        sequence: "47265245278912432",
        subentry_count: 0,
        last_modified_ledger: 452,
        thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
        flags: { auth_required: false, auth_revocable: false, auth_immutable: false },
        balances: [
          {
            balance: "10000.0000000",
            limit: "922337203685.4775807",
            buying_liabilities: "0.0000000",
            selling_liabilities: "0.0000000",
            is_authorized: true,
            asset_type: "native",
          },
        ],
        signers: [
          {
            weight: 1,
            key: MOCK_PUBLIC_KEY,
            type: "ed25519_public_key",
          },
        ],
        data: {},
        data_attr: {},
      },
    }).as("getAccount");

    // Single-transaction lookups (e.g. the confirmation poll performed after a
    // payment is submitted: GET /transactions/:hash) return one record.
    cy.intercept("GET", "**/transactions/*", {
      statusCode: 200,
      body: {
        id: "mock-tx-hash",
        hash: "mock-tx-hash",
        created_at: "2026-02-28T09:00:01Z",
        successful: true,
        fee_charged: "100",
        ledger_attr: 1,
        operation_count: 1,
        source_account: MOCK_PUBLIC_KEY,
        operations: [],
      },
    }).as("getTransaction");

    // Transaction list queries (GET /transactions?...) return an embedded set.
    cy.intercept("GET", "**/transactions?*", {
      statusCode: 200,
      body: { _embedded: { records: [transaction] } },
    }).as("getTransactions");

    cy.intercept("POST", "**/transactions", {
      statusCode: 200,
      body: { hash: "mock-tx-hash", successful: true },
    }).as("submitTransaction");
  });
});

export {};
