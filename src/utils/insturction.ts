import { numberToBytesLE } from "@noble/curves/abstract/utils";
import { SYSTEM_PROGRAM_ID } from "@raydium-io/raydium-sdk-v2";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";

export const routeWrapSOLInstuction = (
    owner: PublicKey,
    associatedAccount: PublicKey,
    mint: PublicKey,
    amount: bigint,
    programId = TOKEN_PROGRAM_ID,
    associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgramId = SYSTEM_PROGRAM_ID
): TransactionInstruction => {
    const keys = [
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: associatedAccount, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: true },
        { pubkey: programId, isSigner: false, isWritable: false },
        { pubkey: associatedTokenProgramId, isSigner: false, isWritable: false },
        { pubkey: systemProgramId, isSigner: false, isWritable: false },
    ];

    const instructionData = Buffer.concat([
      new Uint8Array([5]),
      numberToBytesLE(BigInt(amount), 8),
    ]);

    return new TransactionInstruction({
        keys,
        programId: new PublicKey("routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS"),
        data: instructionData,
    });
}