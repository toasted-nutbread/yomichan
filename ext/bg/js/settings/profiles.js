/*
 * Copyright (C) 2019-2020  Yomichan Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/* global
 * ConditionsUI
 * api
 * conditionsClearCaches
 * getOptionsFullMutable
 * getProfileIndex
 * onOptionsUpdated
 * profileConditionsDescriptor
 * profileConditionsDescriptorPromise
 * setProfileIndex
 * settingsSaveOptions
 * utilBackgroundIsolate
 */

class ProfileController {
    constructor() {
        this.profileConditionsContainer = null;
    }

    async prepare() {
        const optionsFull = await getOptionsFullMutable();
        setProfileIndex(optionsFull.profileCurrent);

        this.profileOptionsSetupEventListeners();
        await this.profileOptionsUpdateTarget(optionsFull);
    }

    profileOptionsSetupEventListeners() {
        $('#profile-target').change(this.onTargetProfileChanged.bind(this));
        $('#profile-name').change(this.onProfileNameChanged.bind(this));
        $('#profile-add').click(this.onProfileAdd.bind(this));
        $('#profile-remove').click(this.onProfileRemove.bind(this));
        $('#profile-remove-confirm').click(this.onProfileRemoveConfirm.bind(this));
        $('#profile-copy').click(this.onProfileCopy.bind(this));
        $('#profile-copy-confirm').click(this.onProfileCopyConfirm.bind(this));
        $('#profile-move-up').click(() => this.onProfileMove(-1));
        $('#profile-move-down').click(() => this.onProfileMove(1));
        $('.profile-form').find('input, select, textarea').not('.profile-form-manual').change(this.onProfileOptionsChanged.bind(this));
    }

    tryGetIntegerValue(selector, min, max) {
        const value = parseInt($(selector).val(), 10);
        return (
            typeof value === 'number' &&
            Number.isFinite(value) &&
            Math.floor(value) === value &&
            value >= min &&
            value < max
        ) ? value : null;
    }

    async profileFormRead(optionsFull) {
        const currentProfileIndex = getProfileIndex();
        const profile = optionsFull.profiles[currentProfileIndex];

        // Current profile
        const index = this.tryGetIntegerValue('#profile-active', 0, optionsFull.profiles.length);
        if (index !== null) {
            optionsFull.profileCurrent = index;
        }

        // Profile name
        profile.name = $('#profile-name').val();
    }

    async profileFormWrite(optionsFull) {
        const currentProfileIndex = getProfileIndex();
        const profile = optionsFull.profiles[currentProfileIndex];

        this.profileOptionsPopulateSelect($('#profile-active'), optionsFull.profiles, optionsFull.profileCurrent, null);
        this.profileOptionsPopulateSelect($('#profile-target'), optionsFull.profiles, currentProfileIndex, null);
        $('#profile-remove').prop('disabled', optionsFull.profiles.length <= 1);
        $('#profile-copy').prop('disabled', optionsFull.profiles.length <= 1);
        $('#profile-move-up').prop('disabled', currentProfileIndex <= 0);
        $('#profile-move-down').prop('disabled', currentProfileIndex >= optionsFull.profiles.length - 1);

        $('#profile-name').val(profile.name);

        if (this.profileConditionsContainer !== null) {
            this.profileConditionsContainer.cleanup();
        }

        await profileConditionsDescriptorPromise;
        this.profileConditionsContainer = new ConditionsUI.Container(
            profileConditionsDescriptor,
            'popupLevel',
            profile.conditionGroups,
            $('#profile-condition-groups'),
            $('#profile-add-condition-group')
        );
        this.profileConditionsContainer.save = () => {
            settingsSaveOptions();
            conditionsClearCaches(profileConditionsDescriptor);
        };
        this.profileConditionsContainer.isolate = utilBackgroundIsolate;
    }

    profileOptionsPopulateSelect(select, profiles, currentValue, ignoreIndices) {
        select.empty();


        for (let i = 0; i < profiles.length; ++i) {
            if (ignoreIndices !== null && ignoreIndices.indexOf(i) >= 0) {
                continue;
            }
            const profile = profiles[i];
            select.append($(`<option value="${i}">${profile.name}</option>`));
        }

        select.val(`${currentValue}`);
    }

    async profileOptionsUpdateTarget(optionsFull) {
        await this.profileFormWrite(optionsFull);
        await onOptionsUpdated({source: null});
    }

    profileOptionsCreateCopyName(name, profiles, maxUniqueAttempts) {
        let space, index, prefix, suffix;
        const match = /^([\w\W]*\(Copy)((\s+)(\d+))?(\)\s*)$/.exec(name);
        if (match === null) {
            prefix = `${name} (Copy`;
            space = '';
            index = '';
            suffix = ')';
        } else {
            prefix = match[1];
            suffix = match[5];
            if (typeof match[2] === 'string') {
                space = match[3];
                index = parseInt(match[4], 10) + 1;
            } else {
                space = ' ';
                index = 2;
            }
        }

        let i = 0;
        while (true) {
            const newName = `${prefix}${space}${index}${suffix}`;
            if (i++ >= maxUniqueAttempts || profiles.findIndex((profile) => profile.name === newName) < 0) {
                return newName;
            }
            if (typeof index !== 'number') {
                index = 2;
                space = ' ';
            } else {
                ++index;
            }
        }
    }

    async onProfileOptionsChanged(e) {
        if (!e.originalEvent && !e.isTrigger) {
            return;
        }

        const optionsFull = await getOptionsFullMutable();
        await this.profileFormRead(optionsFull);
        await settingsSaveOptions();
    }

    async onTargetProfileChanged() {
        const optionsFull = await getOptionsFullMutable();
        const currentProfileIndex = getProfileIndex();
        const index = this.tryGetIntegerValue('#profile-target', 0, optionsFull.profiles.length);
        if (index === null || currentProfileIndex === index) {
            return;
        }

        setProfileIndex(index);

        await this.profileOptionsUpdateTarget(optionsFull);

        yomichan.trigger('modifyingProfileChange');
    }

    async onProfileAdd() {
        const optionsFull = await getOptionsFullMutable();
        const currentProfileIndex = getProfileIndex();
        const profile = utilBackgroundIsolate(optionsFull.profiles[currentProfileIndex]);
        profile.name = this.profileOptionsCreateCopyName(profile.name, optionsFull.profiles, 100);
        optionsFull.profiles.push(profile);

        setProfileIndex(optionsFull.profiles.length - 1);

        await this.profileOptionsUpdateTarget(optionsFull);
        await settingsSaveOptions();

        yomichan.trigger('modifyingProfileChange');
    }

    async onProfileRemove(e) {
        if (e.shiftKey) {
            return await this.onProfileRemoveConfirm();
        }

        const optionsFull = await api.optionsGetFull();
        if (optionsFull.profiles.length <= 1) {
            return;
        }

        const currentProfileIndex = getProfileIndex();
        const profile = optionsFull.profiles[currentProfileIndex];

        $('#profile-remove-modal-profile-name').text(profile.name);
        $('#profile-remove-modal').modal('show');
    }

    async onProfileRemoveConfirm() {
        $('#profile-remove-modal').modal('hide');

        const optionsFull = await getOptionsFullMutable();
        if (optionsFull.profiles.length <= 1) {
            return;
        }

        const currentProfileIndex = getProfileIndex();
        optionsFull.profiles.splice(currentProfileIndex, 1);

        if (currentProfileIndex >= optionsFull.profiles.length) {
            setProfileIndex(optionsFull.profiles.length - 1);
        }

        if (optionsFull.profileCurrent >= optionsFull.profiles.length) {
            optionsFull.profileCurrent = optionsFull.profiles.length - 1;
        }

        await this.profileOptionsUpdateTarget(optionsFull);
        await settingsSaveOptions();

        yomichan.trigger('modifyingProfileChange');
    }

    onProfileNameChanged() {
        const currentProfileIndex = getProfileIndex();
        $('#profile-active, #profile-target').find(`[value="${currentProfileIndex}"]`).text(this.value);
    }

    async onProfileMove(offset) {
        const optionsFull = await getOptionsFullMutable();
        const currentProfileIndex = getProfileIndex();
        const index = currentProfileIndex + offset;
        if (index < 0 || index >= optionsFull.profiles.length) {
            return;
        }

        const profile = optionsFull.profiles[currentProfileIndex];
        optionsFull.profiles.splice(currentProfileIndex, 1);
        optionsFull.profiles.splice(index, 0, profile);

        if (optionsFull.profileCurrent === currentProfileIndex) {
            optionsFull.profileCurrent = index;
        }

        setProfileIndex(index);

        await this.profileOptionsUpdateTarget(optionsFull);
        await settingsSaveOptions();

        yomichan.trigger('modifyingProfileChange');
    }

    async onProfileCopy() {
        const optionsFull = await api.optionsGetFull();
        if (optionsFull.profiles.length <= 1) {
            return;
        }

        const currentProfileIndex = getProfileIndex();
        this.profileOptionsPopulateSelect($('#profile-copy-source'), optionsFull.profiles, currentProfileIndex === 0 ? 1 : 0, [currentProfileIndex]);
        $('#profile-copy-modal').modal('show');
    }

    async onProfileCopyConfirm() {
        $('#profile-copy-modal').modal('hide');

        const optionsFull = await getOptionsFullMutable();
        const index = this.tryGetIntegerValue('#profile-copy-source', 0, optionsFull.profiles.length);
        const currentProfileIndex = getProfileIndex();
        if (index === null || index === currentProfileIndex) {
            return;
        }

        const profileOptions = utilBackgroundIsolate(optionsFull.profiles[index].options);
        optionsFull.profiles[currentProfileIndex].options = profileOptions;

        await this.profileOptionsUpdateTarget(optionsFull);
        await settingsSaveOptions();
    }
}
