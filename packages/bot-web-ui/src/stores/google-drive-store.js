import { observable, action, makeObservable } from 'mobx';
import { localize, getLanguage } from '@deriv/translations';
import { importExternal, config } from '@deriv/bot-skeleton';
import { button_status } from 'Constants/button-status';

export default class GoogleDriveStore {
    constructor(root_store) {
        makeObservable(this, {
            is_authorised: observable,
            updateSigninStatus: action.bound,
            saveFile: action.bound,
            loadFile: action.bound,
        });

        this.root_store = root_store;
        this.bot_folder_name = `Binary Bot - ${localize('Strategies')}`;
        this.google_auth = null;
        this.setKey();
        this.client = null;
        this.access_token = localStorage.getItem('google_access_token') || '';
        importExternal('https://accounts.google.com/gsi/client').then(() => this.initialiseClient());
        importExternal('https://apis.google.com/js/api.js').then(() => this.initialise());
    }

    is_authorised = !!localStorage.getItem('google_access_token');

    setKey = () => {
        const { scope, discovery_docs } = config.gd;
        this.client_id = process.env.GD_CLIENT_ID;
        this.app_id = process.env.GD_APP_ID;
        this.api_key = process.env.GD_API_KEY;
        this.scope = scope;
        this.discovery_docs = discovery_docs;
    };

    initialise = () => {
        gapi.load('client:picker', () => gapi.client.load(this.discovery_docs));
    };

    initialiseClient = () => {
        this.client = google.accounts.oauth2.initTokenClient({
            client_id: this.client_id,
            scope: this.scope,
            callback: response => {
                this.access_token = response.access_token;
                this.updateSigninStatus(true);
                localStorage.setItem('google_access_token', response.access_token);
            },
        });
    };

    updateSigninStatus(is_signed_in) {
        this.is_authorised = is_signed_in;
    }

    signIn() {
        if (!this.is_authorised) {
            this.client.requestAccessToken();
        }
    }

    signOut() {
        if (this.access_token) {
            gapi.client.setToken('');
            google.accounts.oauth2.revoke(this.access_token);
            localStorage.removeItem('google_access_token');
            this.access_token = '';
        }
        this.updateSigninStatus(false);
    }

    // eslint-disable-next-line class-methods-use-this
    getPickerLanguage() {
        const language = getLanguage();

        if (language === 'zhTw') {
            return 'zh-TW';
        } else if (language === 'zhCn') {
            return 'zh-CN';
        }
        return language;
    }

    async saveFile(options) {
        try {
            await this.signIn();
            if (this.access_token) gapi.client.setToken({ access_token: this.access_token });
            await this.checkFolderExists();
            await this.createSaveFilePicker('application/vnd.google-apps.folder', localize('Select a folder'), options);
        } catch (err) {
            if (err.status === 401) {
                this.signOut();
            }
        }
    }

    async loadFile() {
        await this.signIn();

        if (this.access_token) gapi.client.setToken({ access_token: this.access_token });
        try {
            await gapi.client.drive.files.list({
                pageSize: 10,
                fields: 'files(id, name)',
            });
        } catch (err) {
            if (err?.status === 401) {
                await this.signOut();
                setTimeout(() => {
                    const picker = document.getElementsByClassName('picker-dialog-content')[0];
                    picker.parentNode.removeChild(picker);
                    const pickerBackground = document.getElementsByClassName('picker-dialog-bg');
                    if (pickerBackground.length) {
                        for (let i = 0; i < pickerBackground.length; i++) {
                            pickerBackground[i].style.display = 'none';
                        }
                    }
                }, 500);
            }
        }

        const xml_doc = await this.createLoadFilePicker(
            'text/xml,application/xml',
            localize('Select a Deriv Bot Strategy')
        );

        return xml_doc;
    }

    async checkFolderExists() {
        const { files } = gapi.client.drive;
        const response = await files.list({ q: 'trashed=false' });
        const mime_type = 'application/vnd.google-apps.folder';
        const folder = response.result.files.find(file => file.mimeType === mime_type);

        if (folder) {
            return;
        }

        await files.create({
            resource: {
                name: this.bot_folder_name,
                mimeType: mime_type,
                fields: 'id',
            },
        });
    }

    createSaveFilePicker(mime_type, title, options) {
        const { setButtonStatus } = this.root_store.save_modal;
        return new Promise(resolve => {
            const savePickerCallback = data => {
                if (data.action === google.picker.Action.PICKED) {
                    const folder_id = data.docs[0].id;
                    const strategy_file = new Blob([options.content], { type: options.mimeType });
                    const strategy_file_metadata = JSON.stringify({
                        name: options.name,
                        mimeType: options.mimeType,
                        parents: [folder_id],
                    });

                    const form_data = new FormData();
                    form_data.append('metadata', new Blob([strategy_file_metadata], { type: 'application/json' }));
                    form_data.append('file', strategy_file);

                    const xhr = new XMLHttpRequest();
                    xhr.responseType = 'json';
                    xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
                    xhr.setRequestHeader('Authorization', `Bearer ${this.access_token}`);
                    xhr.onload = () => {
                        if (xhr.status === 401) {
                            this.signOut();
                        }

                        setButtonStatus(button_status.NORMAL);
                        resolve();
                    };
                    xhr.send(form_data);
                } else if (data.action === google.picker.Action.CANCEL) {
                    setButtonStatus(button_status.NORMAL);
                }
            };

            this.showGoogleDriveFilePicker(true, mime_type, title, savePickerCallback);
        });
    }

    createLoadFilePicker(mime_type, title) {
        return new Promise(resolve => {
            const loadPickerCallback = async data => {
                if (data.action === google.picker.Action.PICKED) {
                    const file = data.docs[0];
                    const file_name = file.name;
                    const fileId = file.id;
                    const { files } = gapi.client.drive;

                    const response = await files.get({
                        alt: 'media',
                        fileId,
                        mimeType: 'text/plain',
                    });

                    resolve({ xml_doc: response.body, file_name });
                }
            };

            this.showGoogleDriveFilePicker(false, mime_type, title, loadPickerCallback);
        });
    }

    showGoogleDriveFilePicker(is_save, mime_type, title, callback) {
        const docs_view = new google.picker.DocsView();
        docs_view.setIncludeFolders(true);
        docs_view.setMimeTypes(mime_type);

        if (is_save) {
            docs_view.setSelectFolderEnabled(true);
        }
        const picker = new google.picker.PickerBuilder();
        picker
            .setOrigin(`${window.location.protocol}//${window.location.host}`)
            .setTitle(localize(title))
            .setLocale(this.getPickerLanguage())
            .setAppId(this.app_id)
            .setOAuthToken(this.access_token)
            .addView(docs_view)
            .setDeveloperKey(this.api_key)
            .setSize(1051, 650)
            .setCallback(callback)
            .build()
            .setVisible(true);
    }
}
