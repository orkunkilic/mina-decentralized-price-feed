import { Bool, DeployArgs, Field, method, Permissions, Poseidon, PrivateKey, PublicKey, Signature, SmartContract, state, State, Struct } from "snarkyjs";


export class PublicKeyStruct extends Struct({
    publicKeys: [PublicKey, PublicKey, PublicKey, PublicKey, PublicKey]
}) {
    hash(): Field {
        const { publicKeys } = this;
        const publicKeysInFields = publicKeys.map((publicKey) => publicKey.toFields())
        const publicKeysInFieldFlat = publicKeysInFields.reduce((acc, val) => acc.concat(val), []);
        return Poseidon.hash(publicKeysInFieldFlat);
    }
}

export class SignaturesStruct extends Struct({
    value: Field,
    publicKeys: PublicKeyStruct,
    signatures: [Signature, Signature, Signature, Signature, Signature]
}) {
    verifySignatures(): Bool {
        const { signatures, publicKeys, value } = this;
        return new Bool(signatures.every((sig, i) => sig.verify(publicKeys.publicKeys[i], [value])));
    }
    verifyPublicKeySet(hashOfPublicKeys: Field): Bool {
        const { publicKeys } = this;
        const publicKeysStruct = new PublicKeyStruct(publicKeys);
        return hashOfPublicKeys.equals(publicKeysStruct.hash());
    }
}

export class Oracle extends SmartContract {
    @state(Field) pubKeys = State<Field>();

    init() {
        super.init();
        this.pubKeys.set(new Field(0));
        // set permissions
        this.setPermissions({
            ...Permissions.default(),
            editState: Permissions.proof(),
            setVerificationKey: Permissions.proof(),
        });
    }

    @method updatePublicKeySet(publicKeys: PublicKeyStruct, caller: PrivateKey) {
        // Only allow the zkApp to update the oracle
        caller.toPublicKey().assertEquals(this.address);

        // update oracle
        const currentState = this.pubKeys.get();
        this.pubKeys.assertEquals(currentState);

        const hash = publicKeys.hash();
        this.pubKeys.set(hash);
    }

    @method verifySignatures(signatures: SignaturesStruct) {
        const currentPubKeys = this.pubKeys.get();
        this.pubKeys.assertEquals(currentPubKeys);

        const isPublicKeySetValid = signatures.verifyPublicKeySet(currentPubKeys);
        isPublicKeySetValid.assertTrue();

        const isSignatureValid = signatures.verifySignatures();
        isSignatureValid.assertTrue();
    }
}