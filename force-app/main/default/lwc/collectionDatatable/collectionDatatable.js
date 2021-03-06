/**
 * BSD 3-Clause License
 *
 * Copyright (c) 2019, james@sparkworks.io
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * - Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 * - Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * - Neither the name of the copyright holder nor the names of its
 *   contributors may be used to endorse or promote products derived from
 *   this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import { LightningElement, api, wire } from 'lwc';
import { getRecord } from 'lightning/uiRecordApi';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import getDisplayTypeMap from '@salesforce/apex/DataTableService.getDisplayTypeMap';

// Toast and Errors
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { reduceErrors, createSetFromDelimitedString } from 'c/utils';

export default class CollectionDatatable extends LightningElement {
    @api recordCollection;
    @api title;
    @api showRecordCount;
    @api checkboxType;
    @api
    get shownFields() {
        return this._shownFields;
    }
    set shownFields(value = '') {
        this._shownFields = createSetFromDelimitedString(value, ',');
    }
    @api editableFields;
    @api sortableFields;
    @api sortedBy;
    @api sortedDirection;

    columnWidthsMode;

    // private
    _displayTypeMap;
    _singleRecordId;
    _objectApiName;
    _objectInfo;
    _objectFieldsMap;
    _finalColumns;

    get isUsingShownFields() {
        return this.shownFields && this.shownFields.size;
    }

    async connectedCallback() {
        if (!this.recordCollection || !this.recordCollection.length) {
            return;
        }
        // Use the serverside configured display map for column creation client-side
        this._displayTypeMap = new Map(Object.entries(await getDisplayTypeMap()));

        // Collections can be either from a getRecord (which will contain Ids) or Record (Single) collection.
        const recordIdRow = this.recordCollection.find(row => row.hasOwnProperty('Id'));

        // TODO
        console.log(JSON.parse(JSON.stringify(this.recordCollection)));

        // Should ever only be one or the other, unless I learn some new things about how flow works
        if (recordIdRow) {
            this.initializeFromWire(recordIdRow.Id);
        }
    }

    initializeFromWire(recordId) {
        this._singleRecordId = recordId;
    }

    initializeFromCollection(objectApiName) {
        this._objectApiName = objectApiName;
    }

    @wire(getRecord, { recordId: '$_singleRecordId', layoutTypes: 'Compact' })
    wiredSingleRecord({ error, data }) {
        if (error) {
            this._notifySingleError('getRecord error', error);
        } else if (data) {
            this._objectApiName = data.apiName;
        }
    }

    @wire(getObjectInfo, { objectApiName: '$_objectApiName' })
    wiredObjectInfo({ error, data }) {
        if (error) {
            this._notifySingleError('getObjectInfo error', error);
        } else if (data) {
            this._objectInfo = data;
            // Creating columns means parsing LDS and matching that to design props or what's in the record collection
            this._objectFieldsMap = new Map(Object.entries(this._objectInfo.fields));
            const collectionFields = this._createSetFromUniqueCollectionFields(this.recordCollection);
            const columns = this._createColumns(collectionFields, this.shownFields);
            // Then we can access a public api on the base datatable component
            this.template
                .querySelector('c-datatable')
                .initializeTable(this._objectApiName, columns, this.recordCollection);
        }
    }

    _createSetFromUniqueCollectionFields(collection) {
        const uniqueFields = new Set();
        collection.forEach(row => {
            Object.keys(row).forEach(fieldName => {
                // Prevents flattened fields of SOQL datatable from entering these keys
                if (this._objectFieldsMap.has(fieldName)) {
                    uniqueFields.add(fieldName);
                }
            });
        });
        return uniqueFields;
    }

    _createColumns(collectionFields, fieldsToShow) {
        const finalColumns = [];
        this.columnWidthsMode = this.isUsingShownFields ? 'auto' : 'fixed';
        if (this.isUsingShownFields) {
            fieldsToShow.forEach(fieldName => {
                finalColumns.push(this._createColumnAttribute(fieldName));
            });
        } else {
            collectionFields.forEach(fieldName => {
                finalColumns.push(this._createColumnAttribute(fieldName));
            });
        }
        return finalColumns;
    }

    _createColumnAttribute(fieldName) {
        const fieldConfig = this._objectFieldsMap.get(fieldName);
        return {
            label: fieldConfig.label,
            fieldName: fieldConfig.apiName,
            type: this._displayTypeMap.get(fieldConfig.dataType.toUpperCase()),
            initialWidth: 200
        };
    }

    _notifySingleError(title, error) {
        this.dispatchEvent(
            new ShowToastEvent({
                title: title,
                message: reduceErrors(error)[0],
                variant: 'error',
                mode: 'sticky'
            })
        );
    }
}
