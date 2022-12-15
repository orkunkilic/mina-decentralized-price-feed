import {
    Field,
    SmartContract,
    state,
    State,
    method,
    PrivateKey,
    PublicKey,
    Struct,
    Poseidon,
    Permissions,
    UInt64,
  } from 'snarkyjs';
  import { Oracle, SignaturesStruct } from './Oracle.js';
  
  export class Price extends Struct({
    token: Field,
    price: Field,
    timestamp: UInt64,
  }) {
    static hash(p: Price): Field {
      return Poseidon.hash(Price.toFields(p));
    }
  }
  
  export class DeFi extends SmartContract {
    events = {
      price: Field,
      tokenName: Field,
      oracle: PublicKey,
    };
  
    @state(PublicKey) oracle = State<PublicKey>();
    @state(Field) price = State<Field>();
    @state(Field) tokenName = State<Field>();
  
    init() {
        super.init();
        this.oracle.set(PrivateKey.random().toPublicKey());
        this.price.set(new Field(0));
        this.tokenName.set(new Field(0));
    
        // set permissions
        this.setPermissions({
            ...Permissions.default(),
            editState: Permissions.proof(),
            setVerificationKey: Permissions.proof(),
        });
    }
  
    @method updateOracle(oracle: PublicKey, caller: PrivateKey) {
        // Only allow the zkApp to update the oracle
        caller.toPublicKey().assertEquals(this.address);
    
        // update oracle
        const currentState = this.oracle.get();
        this.oracle.assertEquals(currentState);
    
        this.oracle.set(oracle);
    
        // emit event
        this.emitEvent('oracle', oracle);
    }
  
    @method updateTokenName(tokenName: Field, caller: PrivateKey) {
        // Only allow the zkApp to update the token name
        caller.toPublicKey().assertEquals(this.address);
    
        // update token name
        const currentState = this.tokenName.get();
        this.tokenName.assertEquals(currentState);
    
        this.tokenName.set(tokenName);
    
        // emit event
        this.emitEvent('tokenName', tokenName);
    }
  
    @method updatePrice(signature: SignaturesStruct, priceStruct: Price) {
        const oracleAddress = this.oracle.get();
        this.oracle.assertEquals(oracleAddress);
    
        // Only allow the oracle to update the price
        const oracle = new Oracle(oracleAddress);
        oracle.verifySignatures(signature);
    
        // check that the hashed message is the same as the value
        signature.value.assertEquals(Price.hash(priceStruct));
    
        // update price
        const currentState = this.price.get();
        this.price.assertEquals(currentState);
    
        const token = this.tokenName.get();
        this.tokenName.assertEquals(token);
    
        token.assertEquals(priceStruct.token);
    
        // check that the timestamp is not older than 1 hour
        const timestamp = priceStruct.timestamp;
        this.network.timestamp.assertBetween(
            timestamp,
            timestamp.add(new UInt64(60 * 60 * 1000))
        );
    
        this.price.set(priceStruct.price);
    }
  }
  