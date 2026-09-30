/// <reference types="cypress" />

import { MOCK_PUBLIC_KEY } from "../support/commands";

/**
 * Send-and-confirm payment (Issue #3).
 *
 * Exercises the Send Payment modal on the dashboard: the Freighter
 * connection gate, input validation, and a successful payment submission
 * against the mocked Stellar Horizon API. Payments are signed by the mocked
 * Freighter extension and confirmed via the Horizon confirmation poll, all
 * intercepted in `mockStellarAPI`.
 */
describe("Send Payment (#3)", () => {
  beforeEach(() => {
    cy.visit("/dashboard");
    cy.mockStellarAPI();
  });

  /** Open the Send modal from the Quick Actions tile. */
  const openSendModal = () => {
    cy.get("#quick-action-send").click();
    cy.contains("h2", "Send Assets").should("be.visible");
  };

  it("prompts the user to connect Freighter before sending", () => {
    openSendModal();

    // Disconnected wallets see the connection hint instead of validation.
    cy.contains(
      "Connect Freighter to authorize this payment from your wallet.",
    ).should("be.visible");

    cy.contains("button", "Sign and Send Payment").click();
    cy.contains("Connect Freighter before sending a payment.").should(
      "be.visible",
    );
  });

  it("validates the recipient address", () => {
    cy.connectWallet();
    openSendModal();

    cy.contains("button", "Sign and Send Payment").click();
    cy.contains("Recipient address is required.").should("be.visible");
  });

  it("rejects a malformed Stellar address", () => {
    cy.connectWallet();
    openSendModal();

    cy.get('input[placeholder="G... Stellar public key"]').type("not-a-valid-address");
    cy.get('input[placeholder="0.00"]').type("50");

    cy.contains("button", "Sign and Send Payment").click();
    cy.contains(
      "Recipient must be a valid 56-character Stellar public key.",
    ).should("be.visible");
  });

  it("sends a payment and shows the confirmation", () => {
    cy.connectWallet();
    openSendModal();

    cy.get('input[placeholder="G... Stellar public key"]').type(MOCK_PUBLIC_KEY);
    cy.get('input[placeholder="0.00"]').type("50");

    cy.contains("button", "Sign and Send Payment").click();

    // Validating → building → signing → submitting → confirmed
    cy.contains("h3", "Payment confirmed", { timeout: 20000 }).should(
      "be.visible",
    );
    cy.contains("Back to Dashboard").should("be.visible");
    cy.contains("Transaction hash").should("be.visible");
  });
});
