/*
ioginality.io

Функционал пополнения криптокошелька с использованием сервиса transak.com

Functionality of replenishing a crypto wallet using the transak.com service

button 'pay with card'

example https://ioginality.io/items/738cf43a-d4bc-4473-9fa3-b3afef40bbbd

blade template fragment: 

<button is="pay-card-tx-button" class="button button-variant--primary pay-card-button"
    data-need-license-approve="{{ $item->license ? 1 : 0 }}"
    data-license-url="{{ route('item.license.signature', $item) }}"
    data-authenticated="{{ user() ? 'on' : 'off' }}"
    @if(user()?->public_key) data-signer="{{ user()->public_key }}" @endif
    data-chain-id="{{ $listing->contract->network->chain_id }}" 
    data-listing-amount="{{ $moneyFormatter( $listing->amount, true)['amount_wei'] }}"
    data-currency="{{ $listing->currency }}"
    @if(user()?->email) data-email="{{ user()?->email }}" @endif
    data-item-id="{{ $item->id }}"
    @if($waitingBalanceUp) data-wba='@json($waitingBalanceUp)'@endif
    data-transak-api-key="{{ env('TRANSAK_API_KEY') }}"
    data-environment="{{ env('APP_ENV') == 'production' ? 'PRODUCTION':'STAGING' }}"
    >
    <span>@lang('pay with card')</span>
    <svg>
        <use xlink:href="#credit-card" x="0" y="0"></use>
    </svg>
</button>
*/

import wallet from "../utils/wallet";
import checkWallet from "../utils/checkWallet";
import licenseApprove from "../utils/licenseApprove"; 

import jsonFetch from "../utils/jsonFetch";
import dispatchEvent from "../utils/dispatchEvent";
const { ethers } = require("ethers");

const enableLoadingMode = function($button) {
    if ($button) {
        $button.insertAdjacentHTML('afterbegin', '<span class="loader" aria-hidden="true"></span>');
    }
}

const disableLoadingMode = function($button) {
    if ($button) {
        $button.querySelector('.loader')?.remove();
    }
}


class UiPayCardButton extends HTMLButtonElement {

    busy = false;
    transakInserted = false;
    fee = false;
    balanceNow = {
        value: 0,
        formatted: 0,
    };
    needAmount = false;
    wba = false;

    check_all_flag = false;

    transak_success_flag = false;
    cancel_wait_flag = false;
    checkBalanceTimer = false;

    expectedBalance = false;
    precision = 2000000000000000n; // 0.002 ETH in wei

    checkWalletCounter = 0

    connectedCallback() {
        this.render();
    }

    loadVars() {

        const arr = [
            'needLicenseApprove',
            'licenseUrl',
            'authenticated',
            'signer',
            'chainId',
            'listingAmount',
            'currency',
            'email',
            'itemId',
            'transakApiKey',
            'connectWalletUrl',
            'environment'
        ];

        arr.forEach( k => {
            if(this.dataset.hasOwnProperty(k) && this.dataset[k]){
                this[k] = this.dataset[k];
            }else{
                this[k] = false;
            }
        });

    }

    async checkAll() {
        if (this.check_all_flag) {
            return true;
        }

        await window.waitLoading();

        if (!this.authenticated || this.authenticated == 'off') {
            const $popup = document.querySelector('authorisation-popover');
            if($popup) {
                const $inputHidden = `<input type="hidden" name="paycard" value="1" />`;
                $popup.querySelector('form[name="signup"]')?.insertAdjacentHTML('afterbegin', $inputHidden);
                $popup.querySelector('form[name="login"]')?.insertAdjacentHTML('afterbegin', $inputHidden);
                $popup.querySelectorAll('button[is="google-auth"]').forEach(x=>x.dataset.paycard = 1);
                
                $popup.handleOpen();
                
                $popup.addEventListener('closed', ()=>{
                    $popup.querySelectorAll('input[name="paycard"]').forEach(e => e.remove());
                    $popup.querySelectorAll('button[is="google-auth"]').forEach(x=> delete x.dataset.paycard);
                });
            }

            notify('To continue you have to sign in');
            return false;
        }

        try{ 
            this.signer = await checkWallet(this.signer);
        }catch(e){}
        
        if(!this.signer){
            return false;
        }

        this.check_all_flag = true;
        return true;
    }

    async handleClick(e) {
        e?.preventDefault();
       
        if (this.busy) {
            return;
        }

        this.busy = true;
        enableLoadingMode(this); 
        
        this.loadVars();   

        let check = await this.checkAll();

        if(check === false){
            this.finish();
            return;
        };    

        try {
            await Promise.all([this.getBalance(), this.getFee()]);
        } catch(e) {
            console.error('pay-card-button : catch Promise.all()', e)
            this.finish();
            return;
        }

        // Show warning if no fee was returned
        if (!this.fee) {
            await notifyPopupPromise({
                text: 'Trouble receiving transaction fees. Fee set 0.',
                close: 'continue'
            });
        }

        this.needAmount = BigInt(this.listingAmount) + BigInt(this.fee); 

        console.log(`pay-card-button : needAmount ${this.weiToETH(this.needAmount)} ETH, ${this.needAmount} wei`);
        console.log(`pay-card-button : balance ${(+this.balanceNow.formatted).toFixed(4)} ETH, ${this.balanceNow.value} wei`);

        if (this.balanceNow.value >= this.needAmount) {
            try {
                await confirmPopupPromise({
                    text: `You have ${(+this.balanceNow.formatted).toFixed(4)} ${this.currency} in your crypto wallet ${address_shorter(this.signer)}. This is enough to buy this artwork. 
                    If you continue this operation, it will top up your crypto wallet with an additional ${ this.weiToETH(this.needAmount)} ${this.currency}`,
                    okText: 'top up with a card',
                    cancelText: 'buy the artwork',

                    okFunction: () => {
                        window.confirmPopupClose(false);
                    },

                    cancelFunction: () => {
                        window.confirmPopupClose(true); // true mean dispatch `closed` event and exec reject();
                        document.querySelector('button[is="sign-tx-button"]')?.handleClick();
                    }
                });

            } catch(e) {
                console.log('pay-card-button : catch confirmPopupPromise', e);
                this.finish();
                return;
            }
        } 
        
        if (this.needLicenseApprove) {
            try {
                await licenseApprove(this.licenseUrl);
            } catch(e) {
                this.finish();
                return;
            }            
        }

        this.transakStart();
      
    }

    async transakStart() {

        if (this.transakInserted) {
            document.getElementById('transakPopup')?.open();
            return;
        }

        console.log('pay-card-button : transakStart this.fee ', this.fee, ' in ETH', this.weiToETH(this.fee));

        if (this.fee === false) {

            await new Promise(resolve => {
                this.addEventListener('feeTaken', () => resolve(true));
            });
           
            console.log('pay-card-button : await fee end', this.fee);
        }

        const trnParams = {
            apiKey: this.transakApiKey,
            cryptoCurrencyCode: 'ETH',
            colorMode: 'DARK',
            environment: this.environment,
            isBuyOrSell: 'BUY',
            defaultCryptoAmount:  ethers.utils.formatEther(this.needAmount), 
            walletAddress: this.signer,
            network: 'ethereum',
            hideMenu: 'true',
            disableWalletAddressForm: 'true',
            email: this.email,
            defaultPaymentMethod: 'credit_debit_card',
        };
        
        let trnUrl;
        if (this.environment == 'PRODUCTION') {
            trnUrl = "https://global.transak.com/?" +  toQueryString(trnParams);
        } else {
            trnUrl = "https://global-stg.transak.com/?" +  toQueryString(trnParams);
        }        

        const html = `
        <info-popup id="transakPopup">
            <popup-overlay data-noclose="1">  
                <section> 
                    <button class="transakClose" data-action="hide">
                        <svg>
                            <use xlink:href="#cross" x="0" y="0"></use>
                        </svg>
                     </button>
                    <iframe class="opacity-o" id="transakIframe" src="${trnUrl}" allow="camera;microphone;payment"></iframe>
                </section>
            </popup-overlay> 
        </info-popup>`; 
        
        document.body.insertAdjacentHTML('beforeend', html);

        this.transakInserted = true;

        const transakPopup = document.getElementById('transakPopup');
        const transakSection = transakPopup.querySelector('section');

        transakPopup?.open(); 

        enableLoadingMode(transakSection);

        transakPopup?.addEventListener('hided', ()=>{
            this.finish();
        });

        const transakIframe = document.getElementById("transakIframe")?.contentWindow;

        window.addEventListener('message', async (message) => {
            if (message.source !== transakIframe) return;

            console.log('pay-card-button : transak message ', message);
            console.log('pay-card-button : transak message : Event ID: ', message?.data?.event_id);
            console.log('pay-card-button : transak message : status ', message?.data?.data?.status);

            // console.log('flat data', this.flattenObject(message?.data));
            const { status } = message?.data?.data
            this.sendLog(`Pay-card: Transak MessageEvent ${message?.data?.event_id}${status ? ` ${status}` : ''}`, 'info', this.flattenObject(message?.data));

            if (message?.data?.event_id === 'TRANSAK_WIDGET_OPEN') {
                disableLoadingMode(transakPopup);
                transakPopup.querySelector('iframe')?.classList.remove('opacity-0');
            }


            if (message?.data?.event_id === 'TRANSAK_WIDGET_CLOSE') {
                dispatchEvent(transakPopup, 'hided');
            } 

            // button 'Confirm' ==> event AWAITING_PAYMENT_FROM_USER
            // button 'I have Paid' ==> event TRANSAK_ORDER_SUCCESSFUL , than=> TRANSAK_ORDER_SUCCESSFUL

            if (
                message?.data?.event_id === 'TRANSAK_ORDER_SUCCESSFUL'
                &&
                ['PENDING_DELIVERY_FROM_TRANSAK', 'PROCESSING'].includes(message?.data?.data?.status)
            ){
                const wba_put_data = {
                    item_id: this.itemId,
                    balance_before: String(this.balanceNow.value),
                    amount: String(this.needAmount) ,
                    transak_id: message.data.data.id,
                    transak_status: message.data.event_id
                }; 

                await jsonFetch('/waiting_balance_up', wba_put_data, 'POST')
                    .catch(e => {
                        console.error('pay-card-button : catch problem with add row in waiting_balance_up ', e);
                    });

                wba_put_data.date = new Date().toISOString().slice(0, 19).replace('T', ' ');
                this.wba = wba_put_data;
                
                this.startWaitBalanceUp();

                setTimeout(() => {
                    transakPopup.hide();
                    this.finish();
                }, 2000);

            }

            /* // OFF event from TRANSAK about balance up
            if (message?.data?.event_id === 'TRANSAK_ORDER_SUCCESSFUL'
                 && message?.data?.data?.status === 'COMPLETED') { 
                
                if(!this.cancel_wait_flag){
                    transakPopup.hide();
                    this.finish();
                    this.cancelWait(); 
                    this.transakSuccess();
                }

            }
            */

        });
    }

    async startWaitBalanceUp() {
        console.log('pay-card-button : run startWaitBalanceUp()', );

        this.loadVars();

        await this.checkAll(); 

        if (!this.wba) {
            console.error('pay-card-button : no wba data');
            return;
        }

        this.checkBalanceUp();

        this.checkBalanceTimer = setInterval(() => { 
            this.checkBalanceUp();
        }, 10000);
    }

    async checkBalanceUp(){
        console.log('pay-card-button : checkBalanceUp() run');

        try {
            this.balanceNow = await wallet.getBalance(this.signer);
        } catch(e) {
            console.error('pay-card-button : catch wallet.getBalance error', e)
        }

        // Convert both values to BigInt and add them
        this.expectedBalance = BigInt(this.wba.balance_before) + BigInt(this.wba.amount);

        this.drawWaitBlock();

        console.log('pay-card-button : this.balanceNow.formatted', this.balanceNow.formatted);
        console.log('pay-card-button : this.expectedBalance', this.weiToETH(this.expectedBalance));

        if(this.balanceNow.value + this.precision >= this.expectedBalance) {
            this.transakSuccess();
            clearInterval(this.checkBalanceTimer);
            return;
        }

        // лог на каждый 5 раз, чтобы не было одинаковых ошибок
        if (this.checkWalletCounter % 5 ===  0 && this.checkWalletCounter !== 0) {
            this.sendLog('Pay-card: check wallet', 'warning', {
                'expected-balance': this.expectedBalance,
                'current-balance': this.balanceNow.formatted,
                'current-with-precision': String(BigInt(this.balanceNow.value) + this.precision),
                'before-balance': this.wba.balance_before,
                'expected-add-balance': this.wba.amount
            })
        }

        this.checkWalletCounter++;
    }

    drawWaitBlock() {
        console.log('pay-card-button : drawWaitBlock() run');
        // Build status message text
        const expectedAmount = this.weiToETH(this?.wba?.amount);
        const statusMessage = `Your wallet is expected to be replenished with ${expectedAmount} ${this.currency}.`;

        // Check if transaction is taking longer than expected
        const TWO_MINUTES = 120 * 1000;
        const transactionStartTime = Date.parse(this.wba.date);
        const isDelayed = window.utcNow() - transactionStartTime > TWO_MINUTES;
        
        const timeMessage = isDelayed 
            ? 'Now it takes a little bit longer than usual. Please wait.'
            : 'This usually takes 1-2 minutes.';

        // Format balance details
        const balanceDetails = `
        Balance before: ${this.weiToETH(this?.wba?.balance_before)} ETH 
        <br>
        Balance now: ${this.weiToETH(this?.balanceNow.value)} ETH 
        <br>
        Expected balance: ${this.weiToETH(this.expectedBalance)} ETH 
        `;

        // Remove existing status element if present
        const existingStatus = document.getElementById('waiting-balance-up');
        existingStatus?.parentNode.removeChild(existingStatus);

        // Build complete message
        const messageHtml = `
            <p>${statusMessage}</p>
            <p>${timeMessage}</p>
            <p>${balanceDetails}</p>
        `;

        // Hide listing control
        document.querySelector('.listing-control')?.classList.add('d-n');

        // Create status element HTML
        const statusHtml = `
        <section id="waiting-balance-up" class="sidebar-frame color-scheme--invert border-radius-24 horizontal-align--center max-width-100">
            <div class="sidebar-frame__description">
                ${messageHtml}
                <button id="cancel_wait" class="mrg10T button button-variant--secondary font-variant--P3-REG">cancel</button>
            </div>
        </section>
        `;

        document.querySelector('.listing-control')?.insertAdjacentHTML('afterend', statusHtml);

        document.querySelector('#waiting-balance-up #cancel_wait')?.addEventListener('click', ()=>{
            this.cancelWaitConfirm();
        });
    }

    sendLog(msg, type, extra) {
        try {
            Sentry.withScope(scope => {
                for (let key in extra) {
                    scope.setExtra(key, extra[key])
                }
                
                Sentry.captureMessage(msg, type)
            });
        } catch(e) {

        }
    }

    flattenObject(ob) {
        var toReturn = {};
    
        for (var i in ob) {
            if (!ob.hasOwnProperty(i)) continue;
    
            if ((typeof ob[i]) == 'object' && ob[i] !== null) {
                var flatObject = this.flattenObject(ob[i]);
                for (var x in flatObject) {
                    if (!flatObject.hasOwnProperty(x)) continue;
    
                    toReturn[i + '.' + x] = flatObject[x];
                }
            } else {
                toReturn[i] = ob[i];
            }
        }
        return toReturn;
    }


    cancelWaitConfirm = async() => {
        try {
            await confirmPopupPromise({ 
                text:'<p class="horizontal-align--center">Are you sure you want to abort the operation?</p>',
                okText: 'abort the operation',
                cancelText: 'keep waiting',
                okFunction: async () => {
                    confirmPopupClose(false); // false mean: no dispatch close event
                    this.cancelWait();
                }                   
            });
        } catch(e) {}
       
    }

    async cancelWait() {
        console.log('pay-card-button : run cancelWait()');

        this.cancel_wait_flag = true;

        if (this.checkBalanceTimer) {
            clearInterval(this.checkBalanceTimer);
        }

        await jsonFetch('/stop_waiting_balance_up', { item_id:this.itemId }, 'POST')
            .catch(e => {
                console.error('pay-card-button : catch jsonFetch /stop_waiting_balance_up ', e);
            });

        document.querySelector('.listing-control')?.classList.remove('d-n');
        document.querySelector('#waiting-balance-up')?.classList.add('d-n');

    }

    async transakSuccess(){
        console.log('pay-card-button : run transakSuccess() : this.transak_success_flag', this.transak_success_flag);

        if (this.transak_success_flag) {
            return;
        }
        
        try {
            await confirmPopupPromise({
                text: `Congratulations!<br>  
                You have successfully funded your wallet.<br>
                You now have ${(+this.balanceNow.formatted).toFixed(4)} ${this.currency}. This is enough to purchase the selected artwork.`,
                okText: 'continue',
                okFunction: ()=>{
                    this.cancelWait();
                    confirmPopupClose(false); // false mean: no dispatch close event

                    // Start buy with crypto
                    document.querySelector('button[is="sign-tx-button"]')?.handleClick();
                }
            });

        } catch(e) {
            return;
        }

        this.transak_success_flag = true;
    }

    async getBalance() { 
        try {
            this.balanceNow = await wallet.getBalance(this.signer);
        } catch(e) {
            console.error('pay-card-button : catch wallet.getBalance', e)
        }
    }

    getFee() {
        return new Promise(async (resolve) => {
            try {
                // Fetch transaction fee from server
                const response = await jsonFetch('/get_fee', {}, 'GET');
                console.log('pay-card-button : getfee response', response);
                // Set fee amount, defaulting to 0 if not returned
                this.fee = response.fee || 0;
                
                // Notify that fee was retrieved
                dispatchEvent(this, 'feeTaken');
                
                // Log fee amount in ETH
                const feeInEth = this.weiToETH(this.fee);
                console.log(`pay-card-button : fee taken ${feeInEth} ETH, ${this.fee} wei`);

                resolve();
                
            } catch (e) {
                console.log('pay-card-button : getFee catch', e);
                // Still resolve even on error since fee will be 0
                this.fee = 0;
                resolve();
            }
        });
    }

    finish() {
        disableLoadingMode(this); 
        this.busy = false;
    }

    weiToETH(wei) {
        wei = String(wei);
        let r = ethers.utils.formatEther(wei);
        return (+r).toFixed(4);
    }

    render() {

        if (this.rendered) {
            return;
        }

        if(this.dataset.wba){
            this.wba = parseJson(this.dataset.wba);
            this.startWaitBalanceUp();
        }

        this.addEventListener('click', this.handleClick, false);

        this.rendered = true;
    }

    disconnectedCallback() {
        // Add cleanup code
        if (this.checkBalanceTimer) {
            clearInterval(this.checkBalanceTimer);
        }
        // Remove event listeners
        this.removeEventListener('click', this.handleClick);
    }
}

window.customElements.define('pay-card-tx-button', UiPayCardButton, { extends: 'button' });