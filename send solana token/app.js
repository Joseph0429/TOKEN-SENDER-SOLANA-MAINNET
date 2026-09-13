import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "https://esm.sh/@solana/web3.js@1.98.4";

import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getMint,
} from "https://esm.sh/@solana/spl-token@0.4.14";

import bs58 from "https://esm.sh/bs58@6.0.0";

const form = document.querySelector("#sendForm");
const sendButton = document.querySelector("#sendButton");
const statusBox = document.querySelector("#status");
const summaryBox = document.querySelector("#summary");
const privateKeyInput = document.querySelector("#privateKey");
const toggleKey = document.querySelector("#toggleKey");

toggleKey.addEventListener("click", () => {
  const hidden = privateKeyInput.type === "password";
  privateKeyInput.type = hidden ? "text" : "password";
  toggleKey.textContent = hidden ? "Hide" : "Show";
  toggleKey.setAttribute("aria-label", hidden ? "Hide private key" : "Show private key");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();

  try {
    setLoading(true);

    const apiInput = form.apiKey.value.trim();
    const mintAddress = new PublicKey(form.mintAddress.value.trim());
    const receiver = new PublicKey(form.receiverAddress.value.trim());
    const sender = parsePrivateKey(form.privateKey.value);
    const rpcUrl = createRpcUrl(apiInput, form.network.value);
    const connection = new Connection(rpcUrl, "confirmed");

    if (sender.publicKey.equals(receiver)) {
      throw new Error("Sender and receiver wallets must be different.");
    }

    const mintAccount = await connection.getAccountInfo(mintAddress, "confirmed");
    if (!mintAccount) throw new Error("Token mint was not found on the selected network.");

    const tokenProgram = detectTokenProgram(mintAccount.owner);
    const mintInfo = await getMint(connection, mintAddress, "confirmed", tokenProgram);
    const rawAmount = parseAmount(form.amount.value, mintInfo.decimals);

    const senderAta = getAssociatedTokenAddressSync(
      mintAddress, sender.publicKey, false, tokenProgram
    );
    const receiverAta = getAssociatedTokenAddressSync(
      mintAddress, receiver, false, tokenProgram
    );

    const balance = await connection.getTokenAccountBalance(senderAta, "confirmed")
      .catch(() => null);
    if (!balance) throw new Error("The sender does not have a token account for this mint.");
    if (BigInt(balance.value.amount) < rawAmount) {
      throw new Error(`Insufficient token balance. Available: ${balance.value.uiAmountString}`);
    }

    summaryBox.hidden = false;
    summaryBox.textContent = `Sending ${form.amount.value.trim()} tokens from ${short(sender.publicKey)} to ${short(receiver)}…`;

    const transaction = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        sender.publicKey,
        receiverAta,
        receiver,
        mintAddress,
        tokenProgram
      ),
      createTransferCheckedInstruction(
        senderAta,
        mintAddress,
        receiverAta,
        sender.publicKey,
        rawAmount,
        mintInfo.decimals,
        [],
        tokenProgram
      )
    );

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [sender],
      { commitment: "confirmed", maxRetries: 5 }
    );

    // Remove the secret from the form as soon as signing is complete.
    form.privateKey.value = "";
    summaryBox.hidden = true;

    const cluster = form.network.value === "devnet" ? "?cluster=devnet" : "";
    showStatus(
      "success",
      `Transfer confirmed. Signature: ${signature}`,
      `https://orb.helius.dev/tx/${signature}${cluster}`
    );
  } catch (error) {
    summaryBox.hidden = true;
    showStatus("error", friendlyError(error));
  } finally {
    setLoading(false);
  }
});

function createRpcUrl(value, network) {
  if (!value) throw new Error("Enter your Helius API key or complete RPC URL.");
  if (/^https:\/\//i.test(value)) return value;

  const host = network === "devnet" ? "devnet.helius-rpc.com" : "mainnet.helius-rpc.com";
  return `https://${host}/?api-key=${encodeURIComponent(value)}`;
}

function parsePrivateKey(value) {
  const key = value.trim();
  if (!key) throw new Error("Enter the sender private key.");

  try {
    if (key.startsWith("[")) {
      const bytes = JSON.parse(key);
      if (!Array.isArray(bytes)) throw new Error();
      return Keypair.fromSecretKey(Uint8Array.from(bytes));
    }
    return Keypair.fromSecretKey(bs58.decode(key));
  } catch {
    throw new Error("Invalid private key. Use a base58 key or JSON secret-key array.");
  }
}

function detectTokenProgram(owner) {
  if (owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  if (owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  throw new Error("This mint is not owned by SPL Token or Token-2022.");
}

function parseAmount(value, decimals) {
  const amount = value.trim();
  if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error("Enter a valid positive token amount.");

  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > decimals) {
    throw new Error(`This token supports a maximum of ${decimals} decimal places.`);
  }

  const raw = BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0");
  if (raw <= 0n) throw new Error("Amount must be greater than zero.");
  return raw;
}

function short(publicKey) {
  const value = publicKey.toBase58();
  return `${value.slice(0, 5)}…${value.slice(-5)}`;
}

function setLoading(loading) {
  sendButton.disabled = loading;
  sendButton.classList.toggle("loading", loading);
  sendButton.querySelector(".button-label").textContent = loading ? "Sending…" : "Test Send";
}

function clearStatus() {
  statusBox.hidden = true;
  statusBox.className = "status";
  statusBox.replaceChildren();
}

function showStatus(type, message, link = "") {
  statusBox.hidden = false;
  statusBox.className = `status ${type}`;
  const text = document.createElement("div");
  text.textContent = message;
  statusBox.append(text);

  if (link) {
    const anchor = document.createElement("a");
    anchor.href = link;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = "View transaction on Helius Orb";
    statusBox.append(document.createElement("br"), anchor);
  }
}

function friendlyError(error) {
  const message = String(error?.message || error || "Transfer failed.");
  if (/failed to fetch/i.test(message)) {
    return "Could not reach the RPC endpoint. Check your Helius API key, connection, and browser console.";
  }
  return message.replace(/^Error:\s*/i, "");
}

// Reduce how long secrets remain in memory when leaving or reloading the page.
window.addEventListener("pagehide", () => { privateKeyInput.value = ""; });
