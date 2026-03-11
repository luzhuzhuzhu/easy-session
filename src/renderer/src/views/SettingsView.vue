<template>
  <div class="settings-page">
    <h1>{{ $t('settings.title') }}</h1>

    <section class="settings-section">
      <h2>{{ $t('settings.appearance') }}</h2>
      <div class="setting-row">
        <label>{{ $t('settings.theme') }}</label>
        <select v-model="settingsStore.settings.theme" @change="handleSave">
          <option value="dark">{{ $t('settings.themeDark') }}</option>
          <option value="light" disabled>{{ $t('settings.themeLight') }} ({{ $t('settings.comingSoon') }})</option>
        </select>
      </div>
    </section>

    <section class="settings-section">
      <h2>{{ $t('settings.language') }}</h2>
      <div class="setting-row">
        <label>{{ $t('settings.language') }}</label>
        <select v-model="settingsStore.settings.language" @change="handleSave">
          <option value="zh-CN">中文</option>
          <option value="en">English</option>
        </select>
      </div>
    </section>

    <section class="settings-section">
      <h2>{{ $t('settings.sessions') }}</h2>
      <div class="setting-row">
        <label>{{ $t('settings.sessionWakeConfirm') }}</label>
        <input v-model="settingsStore.settings.sessionWakeConfirm" type="checkbox" @change="handleSave" />
      </div>
      <div class="setting-row">
        <label>{{ $t('settings.sessionsListPosition') }}</label>
        <button class="toggle-btn" type="button" @click="toggleSessionsListPosition">
          {{ settingsStore.settings.sessionsListPosition === 'left' ? 'L' : 'T' }}
        </button>
      </div>
      <div class="setting-row">
        <label>{{ $t('settings.sessionsPanelCollapsed') }}</label>
        <input v-model="settingsStore.settings.sessionsPanelCollapsed" type="checkbox" @change="handleSave" />
      </div>
      <div class="setting-row">
        <label>{{ $t('settings.smartPriorityEnabled') }}</label>
        <input v-model="settingsStore.settings.smartPriorityEnabled" type="checkbox" @change="handleSave" />
      </div>
      <div class="setting-row">
        <label>{{ $t('settings.smartPriorityScope') }}</label>
        <select v-model="settingsStore.settings.smartPriorityScope" @change="handleSave">
          <option value="both">{{ $t('settings.smartPriorityScopeBoth') }}</option>
          <option value="sessions">{{ $t('settings.smartPriorityScopeSessions') }}</option>
          <option value="projects">{{ $t('settings.smartPriorityScopeProjects') }}</option>
        </select>
      </div>
      <div class="setting-row">
        <label>{{ $t('settings.smartPriorityMode') }}</label>
        <select v-model="settingsStore.settings.smartPriorityMode" @change="handleSave">
          <option value="balanced">{{ $t('settings.smartPriorityModeBalanced') }}</option>
          <option value="recent">{{ $t('settings.smartPriorityModeRecent') }}</option>
        </select>
      </div>
    </section>

    <section class="settings-section">
      <h2>{{ $t('settings.cliPaths') }}</h2>
      <div class="setting-row">
        <label>{{ $t('settings.claudePath') }}</label>
        <input v-model="settingsStore.settings.claudePath" type="text" :placeholder="$t('settings.autoDetect')" @change="handleSave" />
      </div>
      <div class="setting-row">
        <label>{{ $t('settings.codexPath') }}</label>
        <input v-model="settingsStore.settings.codexPath" type="text" :placeholder="$t('settings.autoDetect')" @change="handleSave" />
      </div>
      <div class="setting-row">
        <label>{{ $t('settings.opencodePath') }}</label>
        <input v-model="settingsStore.settings.opencodePath" type="text" :placeholder="$t('settings.autoDetect')" @change="handleSave" />
      </div>
    </section>

    <section class="settings-section settings-section-remote">
      <div class="section-head">
        <div>
          <h2>{{ $t('settings.localRemoteService') }}</h2>
          <p class="setting-hint section-hint">{{ $t('settings.localRemoteServiceHint') }}</p>
        </div>
        <div class="instance-summary">
          <span class="summary-pill" :class="{ online: remoteServiceState?.running }">
            {{
              remoteServiceState?.running
                ? $t('settings.remoteServiceRunning')
                : $t('settings.remoteServiceStopped')
            }}
          </span>
          <span class="summary-pill">{{ remoteServiceState?.tokenSource ? formatTokenSource(remoteServiceState.tokenSource) : '-' }}</span>
        </div>
      </div>

      <div v-if="remoteServiceLoading" class="remote-disabled-state">
        {{ $t('settings.remoteServiceLoading') }}
      </div>

      <template v-else>
        <div v-if="hasRemoteServiceEnvOverrides" class="remote-disabled-state remote-service-env-note">
          {{ $t('settings.remoteServiceEnvOverrideHint', { fields: remoteServiceEnvOverrideFields }) }}
        </div>

        <div class="remote-form-panel">
          <div class="remote-form-grid">
            <label class="checkbox-row field-block field-block-inline-start">
              <input v-model="remoteServiceForm.enabled" type="checkbox" />
              <span>{{ $t('settings.remoteServiceEnabled') }}</span>
            </label>
            <label class="checkbox-row field-block field-block-inline-start">
              <input v-model="remoteServiceForm.passthroughOnly" type="checkbox" />
              <span>{{ $t('settings.remoteServicePassthroughOnly') }}</span>
            </label>
            <div class="field-block field-block-wide field-hint-only">
              <span class="setting-hint inline-hint">{{ $t('settings.remoteServiceControlRiskHint') }}</span>
            </div>
            <div class="field-block">
              <label>{{ $t('settings.remoteServiceHost') }}</label>
              <input v-model.trim="remoteServiceForm.host" type="text" :placeholder="$t('settings.remoteServiceHostPlaceholder')" />
            </div>
            <div class="field-block">
              <label>{{ $t('settings.remoteServicePort') }}</label>
              <input v-model.number="remoteServiceForm.port" type="number" min="1" max="65535" />
            </div>
            <div class="field-block">
              <label>{{ $t('settings.remoteServiceTokenMode') }}</label>
              <select v-model="remoteServiceForm.tokenMode">
                <option value="default">{{ $t('settings.remoteServiceTokenModeDefault') }}</option>
                <option value="custom">{{ $t('settings.remoteServiceTokenModeCustom') }}</option>
              </select>
            </div>
            <div class="field-block field-block-wide">
              <label>{{ $t('settings.remoteServiceCustomToken') }}</label>
              <input
                v-model.trim="remoteServiceForm.customToken"
                type="password"
                autocomplete="new-password"
                :placeholder="
                  remoteServiceForm.tokenMode === 'custom'
                    ? $t('settings.remoteServiceCustomTokenPlaceholder')
                    : $t('settings.remoteServiceCustomTokenDisabled')
                "
                :disabled="remoteServiceForm.tokenMode !== 'custom'"
              />
              <span v-if="remoteServiceForm.tokenMode === 'custom' && remoteServiceState?.customTokenConfigured" class="setting-hint inline-hint">
                {{ $t('settings.remoteServiceCustomTokenKeepHint') }}
              </span>
            </div>
          </div>

          <div class="remote-form-actions">
            <button
              class="btn btn-primary btn-sm"
              type="button"
              :disabled="savingRemoteService || !canSubmitRemoteServiceForm"
              @click="handleSaveRemoteService"
            >
              {{ savingRemoteService ? $t('settings.remoteServiceApplying') : $t('settings.remoteServiceApply') }}
            </button>
            <button
              class="btn btn-sm"
              type="button"
              :disabled="copyingRemoteServiceToken || !remoteServiceState"
              @click="handleCopyRemoteServiceToken"
            >
              {{ copyingRemoteServiceToken ? $t('settings.remoteServiceCopyingToken') : $t('settings.remoteServiceCopyToken') }}
            </button>
            <button
              class="btn btn-sm"
              type="button"
              :disabled="regeneratingRemoteServiceToken"
              @click="handleRegenerateRemoteServiceToken"
            >
              {{
                regeneratingRemoteServiceToken
                  ? $t('settings.remoteServiceRegeneratingToken')
                  : $t('settings.remoteServiceRegenerateDefaultToken')
              }}
            </button>
          </div>
        </div>

        <div v-if="remoteServiceState" class="remote-card-grid">
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.remoteServiceConfiguredEnabled') }}</span>
            <span class="meta-value">{{ remoteServiceState.configuredEnabled ? $t('settings.remoteYes') : $t('settings.remoteNo') }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.remoteServiceEffectiveEnabled') }}</span>
            <span class="meta-value">{{ remoteServiceState.effectiveEnabled ? $t('settings.remoteYes') : $t('settings.remoteNo') }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.remoteServiceCurrentBaseUrl') }}</span>
            <span class="meta-value mono">{{ remoteServiceState.baseUrl }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.remoteServiceTokenSource') }}</span>
            <span class="meta-value">{{ formatTokenSource(remoteServiceState.tokenSource) }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.remoteServiceTokenFingerprint') }}</span>
            <span class="meta-value mono">{{ remoteServiceState.tokenFingerprint }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.remoteServiceTokenFilePath') }}</span>
            <span class="meta-value mono">{{ remoteServiceState.tokenFilePath }}</span>
          </div>
        </div>
      </template>
    </section>

    <section class="settings-section settings-section-remote">
      <div class="section-head">
        <div>
          <h2>{{ $t('settings.cloudflareTunnel') }}</h2>
          <p class="setting-hint section-hint">{{ $t('settings.cloudflareTunnelHint') }}</p>
        </div>
        <div class="instance-summary">
          <span class="summary-pill" :class="{ online: cloudflareTunnelState?.running }">
            {{
              cloudflareTunnelState?.running
                ? $t('settings.cloudflareTunnelRunning')
                : $t('settings.cloudflareTunnelStopped')
            }}
          </span>
          <span class="summary-pill">
            {{
              cloudflareTunnelState?.pathSource
                ? formatCloudflarePathSource(cloudflareTunnelState.pathSource)
                : '-'
            }}
          </span>
        </div>
      </div>

      <div v-if="cloudflareTunnelLoading" class="remote-disabled-state">
        {{ $t('settings.cloudflareTunnelLoading') }}
      </div>

      <template v-else>
        <div class="remote-form-panel">
          <div class="remote-form-grid">
            <div class="field-block field-block-wide">
              <label>{{ $t('settings.cloudflareTunnelBinaryPath') }}</label>
              <input
                v-model.trim="cloudflareBinaryPathInput"
                type="text"
                :placeholder="$t('settings.cloudflareTunnelBinaryPathPlaceholder')"
              />
              <span class="setting-hint inline-hint">
                {{ $t('settings.cloudflareTunnelBinaryPathHint') }}
              </span>
            </div>
          </div>

          <div class="remote-form-actions">
            <button
              class="btn btn-sm"
              type="button"
              :disabled="savingCloudflareTunnelConfig"
              @click="handleSaveCloudflareTunnelConfig"
            >
              {{
                savingCloudflareTunnelConfig
                  ? $t('settings.cloudflareTunnelConfigSaving')
                  : $t('settings.cloudflareTunnelConfigSave')
              }}
            </button>
            <button
              class="btn btn-primary btn-sm"
              type="button"
              :disabled="startingCloudflareTunnel || !canStartCloudflareTunnel || !!cloudflareTunnelState?.running"
              @click="handleStartCloudflareTunnel"
            >
              {{
                startingCloudflareTunnel
                  ? $t('settings.cloudflareTunnelStarting')
                  : $t('settings.cloudflareTunnelStart')
              }}
            </button>
            <button
              class="btn btn-sm"
              type="button"
              :disabled="stoppingCloudflareTunnel || !cloudflareTunnelState?.running"
              @click="handleStopCloudflareTunnel"
            >
              {{
                stoppingCloudflareTunnel
                  ? $t('settings.cloudflareTunnelStopping')
                  : $t('settings.cloudflareTunnelStop')
              }}
            </button>
            <button
              class="btn btn-sm"
              type="button"
              :disabled="copyingCloudflareTunnelUrl || !cloudflareTunnelState?.publicUrl"
              @click="handleCopyCloudflareTunnelUrl"
            >
              {{
                copyingCloudflareTunnelUrl
                  ? $t('settings.cloudflareTunnelUrlCopying')
                  : $t('settings.cloudflareTunnelCopyUrl')
              }}
            </button>
          </div>
        </div>

        <div v-if="remoteServiceState && !remoteServiceState.running" class="remote-disabled-state remote-service-env-note">
          {{ $t('settings.cloudflareTunnelRequiresRemoteService') }}
        </div>

        <div v-if="cloudflareTunnelState" class="remote-card-grid">
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.cloudflareTunnelAvailability') }}</span>
            <span class="meta-value">{{ cloudflareTunnelState.available ? $t('settings.remoteYes') : $t('settings.remoteNo') }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.cloudflareTunnelPathSource') }}</span>
            <span class="meta-value">{{ formatCloudflarePathSource(cloudflareTunnelState.pathSource) }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.cloudflareTunnelConfiguredTransport') }}</span>
            <span class="meta-value">{{ formatTransportMode(cloudflareTunnelState.transportMode) }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.cloudflareTunnelConfiguredProxy') }}</span>
            <span class="meta-value">{{ formatProxyMode(cloudflareTunnelState.proxyMode) }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.cloudflareTunnelEffectiveTransport') }}</span>
            <span class="meta-value">{{ formatTransportMode(cloudflareTunnelState.effectiveTransport) }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.cloudflareTunnelEffectiveProxy') }}</span>
            <span class="meta-value">{{ formatProxyMode(cloudflareTunnelState.effectiveProxyMode) }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.cloudflareTunnelFallbackUsed') }}</span>
            <span class="meta-value">
              {{ cloudflareTunnelState.effectiveFallbackUsed ? $t('settings.remoteYes') : $t('settings.remoteNo') }}
              <template v-if="cloudflareTunnelState.effectiveAttemptIndex">
                · #{{ cloudflareTunnelState.effectiveAttemptIndex }}
              </template>
            </span>
          </div>
          <div class="meta-item meta-item-full">
            <span class="meta-label">{{ $t('settings.cloudflareTunnelEffectiveBinaryPath') }}</span>
            <span class="meta-value mono">{{ cloudflareTunnelState.effectiveBinaryPath || '-' }}</span>
          </div>
          <div class="meta-item meta-item-full">
            <span class="meta-label">{{ $t('settings.cloudflareTunnelLocalTarget') }}</span>
            <span class="meta-value mono">{{ cloudflareTunnelState.localTargetUrl || '-' }}</span>
          </div>
          <div class="meta-item meta-item-full">
            <span class="meta-label">{{ $t('settings.cloudflareTunnelPublicUrl') }}</span>
            <span class="meta-value mono">{{ cloudflareTunnelState.publicUrl || '-' }}</span>
          </div>
          <div class="meta-item meta-item-full">
            <span class="meta-label">{{ $t('settings.cloudflareTunnelLastError') }}</span>
            <span class="meta-value error-text">{{ cloudflareTunnelState.lastError || $t('settings.remoteNoError') }}</span>
          </div>
        </div>
      </template>
    </section>

    <section class="settings-section settings-section-remote">
      <div class="section-head">
        <div>
          <h2>{{ $t('settings.remoteNetworkStrategy') }}</h2>
          <p class="setting-hint section-hint">{{ $t('settings.remoteNetworkStrategyHint') }}</p>
        </div>
        <div class="instance-summary">
          <span class="summary-pill">{{ formatStrategySummary(remoteNetworkState?.cloudflareRecommended || null) }}</span>
          <span class="summary-pill">{{ formatCliResolvedSummary(remoteNetworkState?.cliResolved || null) }}</span>
        </div>
      </div>

      <div v-if="remoteNetworkLoading" class="remote-disabled-state">
        {{ $t('settings.remoteNetworkLoading') }}
      </div>

      <template v-else-if="remoteNetworkState">
        <div class="remote-form-panel">
          <div class="remote-form-grid">
            <div class="field-block">
              <label>{{ $t('settings.remoteNetworkCloudflareTransport') }}</label>
              <select v-model="remoteNetworkForm.cloudflareTransportMode">
                <option value="auto">{{ $t('settings.remoteTransportModeValue.auto') }}</option>
                <option value="http2">{{ $t('settings.remoteTransportModeValue.http2') }}</option>
                <option value="quic">{{ $t('settings.remoteTransportModeValue.quic') }}</option>
              </select>
            </div>
            <div class="field-block">
              <label>{{ $t('settings.remoteNetworkCloudflareProxyMode') }}</label>
              <select v-model="remoteNetworkForm.cloudflareProxyMode">
                <option value="auto">{{ $t('settings.remoteProxyModeValue.auto') }}</option>
                <option value="off">{{ $t('settings.remoteProxyModeValue.off') }}</option>
                <option value="inherit">{{ $t('settings.remoteProxyModeValue.inherit') }}</option>
                <option value="custom">{{ $t('settings.remoteProxyModeValue.custom') }}</option>
              </select>
            </div>
            <div class="field-block field-block-wide">
              <label>{{ $t('settings.remoteNetworkCloudflareCustomProxy') }}</label>
              <input
                v-model.trim="remoteNetworkForm.cloudflareCustomProxyUrl"
                type="text"
                :disabled="remoteNetworkForm.cloudflareProxyMode !== 'custom'"
                :placeholder="$t('settings.remoteNetworkCloudflareCustomProxyPlaceholder')"
              />
            </div>
            <label class="checkbox-row field-block field-block-inline-start">
              <input v-model="remoteNetworkForm.cloudflareRememberLastSuccess" type="checkbox" />
              <span>{{ $t('settings.remoteNetworkRememberLastSuccess') }}</span>
            </label>
            <label class="checkbox-row field-block field-block-inline-start">
              <input v-model="remoteNetworkForm.cloudflareAutoFallback" type="checkbox" />
              <span>{{ $t('settings.remoteNetworkAutoFallback') }}</span>
            </label>
            <div class="field-block">
              <label>{{ $t('settings.remoteNetworkCliProxyMode') }}</label>
              <select v-model="remoteNetworkForm.cliProxyMode">
                <option value="auto">{{ $t('settings.remoteProxyModeValue.auto') }}</option>
                <option value="off">{{ $t('settings.remoteProxyModeValue.off') }}</option>
                <option value="inherit">{{ $t('settings.remoteProxyModeValue.inherit') }}</option>
                <option value="custom">{{ $t('settings.remoteProxyModeValue.custom') }}</option>
              </select>
            </div>
            <div class="field-block field-block-wide">
              <label>{{ $t('settings.remoteNetworkCliCustomProxy') }}</label>
              <input
                v-model.trim="remoteNetworkForm.cliCustomProxyUrl"
                type="text"
                :disabled="remoteNetworkForm.cliProxyMode !== 'custom'"
                :placeholder="$t('settings.remoteNetworkCliCustomProxyPlaceholder')"
              />
            </div>
            <label class="checkbox-row field-block field-block-inline-start">
              <input v-model="remoteNetworkForm.cliEnableNoProxyLocalhost" type="checkbox" />
              <span>{{ $t('settings.remoteNetworkCliNoProxyLocalhost') }}</span>
            </label>
          </div>

          <div class="remote-form-actions">
            <button
              class="btn btn-primary btn-sm"
              type="button"
              :disabled="savingRemoteNetwork || !canSubmitRemoteNetworkForm"
              @click="handleSaveRemoteNetworkSettings"
            >
              {{ savingRemoteNetwork ? $t('settings.remoteNetworkApplying') : $t('settings.remoteNetworkApply') }}
            </button>
          </div>
        </div>

        <div class="remote-card-grid">
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.remoteNetworkDetectedInheritedProxy') }}</span>
            <span class="meta-value mono">{{ remoteNetworkState.detected.inheritedProxyUrl || '-' }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.remoteNetworkDetectedHttpProxy') }}</span>
            <span class="meta-value mono">{{ remoteNetworkState.detected.httpProxyUrl || '-' }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.remoteNetworkDetectedSocksProxy') }}</span>
            <span class="meta-value mono">{{ remoteNetworkState.detected.socksProxyUrl || '-' }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.remoteNetworkDetectedUpdatedAt') }}</span>
            <span class="meta-value">{{ formatLastChecked(remoteNetworkState.detected.updatedAt) }}</span>
          </div>
          <div class="meta-item meta-item-full">
            <span class="meta-label">{{ $t('settings.remoteNetworkCloudflareRecommended') }}</span>
            <span class="meta-value">{{ formatStrategySummary(remoteNetworkState.cloudflareRecommended) }}</span>
          </div>
          <div class="meta-item meta-item-full">
            <span class="meta-label">{{ $t('settings.remoteNetworkCloudflareCandidates') }}</span>
            <span class="meta-value">{{ formatStrategyList(remoteNetworkState.cloudflareCandidates) }}</span>
          </div>
          <div class="meta-item meta-item-full">
            <span class="meta-label">{{ $t('settings.remoteNetworkCloudflareLastSuccessful') }}</span>
            <span class="meta-value">{{ formatLastSuccessfulStrategy() }}</span>
          </div>
          <div class="meta-item meta-item-full">
            <span class="meta-label">{{ $t('settings.remoteNetworkCliResolved') }}</span>
            <span class="meta-value">{{ formatCliResolvedSummary(remoteNetworkState.cliResolved) }}</span>
          </div>
          <div class="meta-item meta-item-full">
            <span class="meta-label">{{ $t('settings.remoteNetworkLastFailureCategory') }}</span>
            <span class="meta-value">{{ formatFailureCategory(remoteNetworkState.runtime.cloudflare.lastFailureCategory) }}</span>
          </div>
          <div class="meta-item meta-item-full">
            <span class="meta-label">{{ $t('settings.remoteNetworkLastFailureReason') }}</span>
            <span class="meta-value error-text">{{ remoteNetworkState.runtime.cloudflare.lastFailureReason || $t('settings.remoteNoError') }}</span>
          </div>
          <div class="meta-item meta-item-full">
            <span class="meta-label">{{ $t('settings.remoteNetworkCloudflareAdvice') }}</span>
            <span class="meta-value">{{ formatCloudflareFailureAdvice(remoteNetworkState.runtime.cloudflare.lastFailureCategory) }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.remoteNetworkCliLastFailureSource') }}</span>
            <span class="meta-value">{{ formatCliFailureSource(remoteNetworkState.runtime.cli.lastFailureCli) }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{{ $t('settings.remoteNetworkCliLastFailureCategory') }}</span>
            <span class="meta-value">{{ formatCliFailureCategory(remoteNetworkState.runtime.cli.lastFailureCategory) }}</span>
          </div>
          <div class="meta-item meta-item-full">
            <span class="meta-label">{{ $t('settings.remoteNetworkCliLastFailureReason') }}</span>
            <span class="meta-value error-text">{{ remoteNetworkState.runtime.cli.lastFailureReason || $t('settings.remoteNoError') }}</span>
          </div>
          <div class="meta-item meta-item-full">
            <span class="meta-label">{{ $t('settings.remoteNetworkCliAdvice') }}</span>
            <span class="meta-value">{{ formatCliFailureAdvice(remoteNetworkState.runtime.cli.lastFailureCategory) }}</span>
          </div>
        </div>
      </template>
    </section>

    <section class="settings-section settings-section-remote">
      <div class="section-head">
        <div>
          <h2>{{ $t('settings.remoteInstances') }}</h2>
          <p class="setting-hint section-hint">{{ $t('settings.remoteInstancesHint') }}</p>
        </div>
        <div class="instance-summary">
          <span class="summary-pill">{{ $t('settings.remoteCount', { count: instancesStore.remoteInstances.length }) }}</span>
          <span class="summary-pill online">{{ $t('settings.remoteOnlineCount', { count: instancesStore.onlineRemoteCount }) }}</span>
        </div>
      </div>

      <div class="setting-row setting-row-stack remote-toggle-row">
        <div class="setting-label-group">
          <label>{{ $t('settings.desktopRemoteMountEnabled') }}</label>
          <p class="setting-hint">{{ $t('settings.desktopRemoteMountHint') }}</p>
        </div>
        <input
          v-model="settingsStore.settings.desktopRemoteMountEnabled"
          type="checkbox"
          @change="handleRemoteFeatureToggle"
        />
      </div>

      <div v-if="!settingsStore.settings.desktopRemoteMountEnabled" class="remote-disabled-state">
        {{ $t('settings.desktopRemoteMountDisabled') }}
      </div>

      <template v-else>
      <div class="remote-form-panel">
        <div class="remote-form-grid">
          <div class="field-block">
            <label>{{ $t('settings.remoteName') }}</label>
            <input v-model.trim="remoteForm.name" type="text" :placeholder="$t('settings.remoteNamePlaceholder')" />
          </div>
          <div class="field-block field-block-wide">
            <label>{{ $t('settings.remoteBaseUrl') }}</label>
            <input v-model.trim="remoteForm.baseUrl" type="text" :placeholder="$t('settings.remoteBaseUrlPlaceholder')" />
          </div>
          <div class="field-block field-block-wide">
            <label>{{ $t('settings.remoteToken') }}</label>
            <input v-model.trim="remoteForm.token" type="password" autocomplete="new-password" :placeholder="$t('settings.remoteTokenPlaceholder')" />
          </div>
          <label class="checkbox-row field-block-inline">
            <input v-model="remoteForm.enabled" type="checkbox" />
            <span>{{ $t('settings.remoteEnabled') }}</span>
          </label>
        </div>

        <div class="remote-form-actions">
          <button class="btn btn-sm" type="button" :disabled="draftBusy || !canSubmitRemoteForm" @click="handleTestDraft">
            {{ draftBusy ? $t('settings.remoteTesting') : $t('settings.remoteTest') }}
          </button>
          <button class="btn btn-primary btn-sm" type="button" :disabled="savingRemote || !canSubmitRemoteForm" @click="handleSaveRemoteInstance">
            {{ savingRemote ? $t('settings.remoteSaving') : (isEditingRemote ? $t('settings.remoteUpdate') : $t('settings.remoteAdd')) }}
          </button>
          <button v-if="isEditingRemote" class="btn btn-sm" type="button" :disabled="savingRemote" @click="resetRemoteForm">
            {{ $t('settings.remoteCancelEdit') }}
          </button>
        </div>

        <div v-if="draftTestResult" class="draft-result" :class="draftTestResult.ok ? 'ok' : 'error'">
          <strong>{{ draftTestResult.ok ? $t('settings.remoteTestSuccess') : $t('settings.remoteTestFail') }}</strong>
          <span>
            {{ formatStatusText(draftTestResult.status) }} · {{ formatLatencyLabel(draftTestResult.latencyMs, draftTestResult.status) }}
            <template v-if="draftTestResult.serverInfo"> · {{ draftTestResult.serverInfo.name }}</template>
          </span>
          <span v-if="draftTestResult.error" class="draft-result-error">{{ draftTestResult.error }}</span>
        </div>
      </div>

      <div v-if="instancesStore.remoteInstances.length === 0" class="remote-empty-state">
        {{ $t('settings.remoteEmpty') }}
      </div>
      <div v-else class="remote-instance-list">
        <article
          v-for="instance in instancesStore.remoteInstances"
          :key="instance.id"
          class="remote-instance-card"
          :class="[`status-${instance.status}`, { disabled: !instance.enabled }]"
        >
          <div class="remote-card-head">
            <div class="remote-card-title">
              <div class="remote-title-line">
                <h3>{{ instance.name }}</h3>
                <span class="status-badge" :class="`status-${instance.status}`">{{ formatStatusText(instance.status) }}</span>
                <span class="mode-badge">{{ instance.passthroughOnly ? $t('settings.remoteModePassthrough') : $t('settings.remoteModeManaged') }}</span>
                <span v-if="!instance.enabled" class="mode-badge muted">{{ $t('settings.remoteDisabled') }}</span>
              </div>
              <p class="remote-card-url">{{ instance.baseUrl }}</p>
            </div>
            <div class="remote-card-actions">
              <button class="btn btn-sm" type="button" :disabled="busyInstanceIds.includes(instance.id)" @click="handleEditRemoteInstance(instance)">
                {{ $t('settings.remoteEdit') }}
              </button>
              <button class="btn btn-sm" type="button" :disabled="busyInstanceIds.includes(instance.id)" @click="handleTestRemoteInstance(instance.id)">
                {{ busyInstanceIds.includes(instance.id) ? $t('settings.remoteTesting') : $t('settings.remoteRetest') }}
              </button>
              <button class="btn btn-danger btn-sm" type="button" :disabled="busyInstanceIds.includes(instance.id)" @click="handleDeleteRemoteInstance(instance.id)">
                {{ $t('settings.remoteDelete') }}
              </button>
            </div>
          </div>

          <div class="remote-card-grid">
            <div class="meta-item">
              <span class="meta-label">{{ $t('settings.remoteBaseUrl') }}</span>
              <span class="meta-value mono">{{ instance.baseUrl }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">{{ $t('settings.remotePassthrough') }}</span>
              <span class="meta-value">{{ instance.passthroughOnly ? $t('settings.remoteYes') : $t('settings.remoteNo') }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">{{ $t('settings.remoteLatency') }}</span>
              <span class="meta-value">{{ formatLatencyLabel(instance.latencyMs, instance.status) }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">{{ $t('settings.remoteLastChecked') }}</span>
              <span class="meta-value">{{ formatLastChecked(instance.lastCheckedAt) }}</span>
            </div>
            <div class="meta-item meta-item-full">
              <span class="meta-label">{{ $t('settings.remoteLastError') }}</span>
              <span class="meta-value error-text">{{ instance.lastError || $t('settings.remoteNoError') }}</span>
            </div>
          </div>
        </article>
      </div>
      </template>
    </section>

    <section class="settings-section">
      <h2>{{ $t('settings.terminal') }}</h2>
      <div class="setting-row">
        <label>{{ $t('settings.bufferSize') }}</label>
        <input v-model.number="settingsStore.settings.bufferSize" type="number" min="1000" max="50000" step="1000" @change="handleSave" />
      </div>
      <div class="setting-row">
        <label>{{ $t('settings.terminalFont') }}</label>
        <input v-model="settingsStore.settings.terminalFont" type="text" @change="handleSave" />
      </div>
    </section>

    <section class="settings-section">
      <h2>{{ $t('settings.about') }}</h2>
      <div class="about-grid">
        <div class="about-item">
          <span class="about-label">{{ $t('settings.version') }}</span>
          <span class="about-value">{{ appStore.version || '-' }}</span>
        </div>
        <div class="about-item">
          <span class="about-label">{{ $t('settings.electronVersion') }}</span>
          <span class="about-value">{{ systemInfo.electronVersion || '-' }}</span>
        </div>
        <div class="about-item">
          <span class="about-label">{{ $t('settings.nodeVersion') }}</span>
          <span class="about-value">{{ systemInfo.nodeVersion || '-' }}</span>
        </div>
        <div class="about-item">
          <span class="about-label">{{ $t('settings.system') }}</span>
          <span class="about-value">{{ systemInfo.platform }} ({{ systemInfo.arch }})</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useAppStore } from '@/stores/app'
import { useInstancesStore } from '@/stores/instances'
import { useProjectsStore } from '@/stores/projects'
import { useSessionsStore } from '@/stores/sessions'
import { useToast } from '@/composables/useToast'
import { useI18n } from 'vue-i18n'
import type { RemoteInstanceConnectionResult, RemoteInstanceDraft } from '@/api/remote-instance'
import {
  getCloudflareTunnelState,
  startCloudflareTunnel,
  stopCloudflareTunnel,
  updateCloudflareTunnelConfig,
  type CloudflareTunnelState
} from '@/api/cloudflare-tunnel'
import {
  type CliFailureCategory,
  type CloudflareFailureCategory,
  getRemoteNetworkState,
  updateRemoteNetworkSettings,
  type CloudflareLaunchStrategyPreview,
  type CliResolvedProxyState,
  type ProxyMode,
  type RemoteNetworkSettingsState,
  type TunnelResolvedTransport,
  type TunnelTransportMode
} from '@/api/remote-network'
import {
  getRemoteServiceState,
  getRemoteServiceToken,
  regenerateRemoteServiceDefaultToken,
  updateRemoteServiceSettings,
  type RemoteServiceState,
  type RemoteServiceTokenMode
} from '@/api/remote-service'
import type { RemoteInstance } from '@/models/unified-resource'

interface RemoteFormState {
  id: string | null
  name: string
  baseUrl: string
  token: string
  enabled: boolean
}

interface RemoteServiceFormState {
  enabled: boolean
  host: string
  port: number
  passthroughOnly: boolean
  tokenMode: RemoteServiceTokenMode
  customToken: string
}

interface RemoteNetworkFormState {
  cloudflareTransportMode: TunnelTransportMode
  cloudflareProxyMode: ProxyMode
  cloudflareCustomProxyUrl: string
  cloudflareRememberLastSuccess: boolean
  cloudflareAutoFallback: boolean
  cliProxyMode: ProxyMode
  cliCustomProxyUrl: string
  cliEnableNoProxyLocalhost: boolean
}

const { t } = useI18n()
const settingsStore = useSettingsStore()
const appStore = useAppStore()
const instancesStore = useInstancesStore()
const projectsStore = useProjectsStore()
const sessionsStore = useSessionsStore()
const toast = useToast()

const systemInfo = ref({ electronVersion: '', nodeVersion: '', platform: '', arch: '' })
const savingRemote = ref(false)
const savingRemoteService = ref(false)
const savingCloudflareTunnelConfig = ref(false)
const startingCloudflareTunnel = ref(false)
const stoppingCloudflareTunnel = ref(false)
const copyingCloudflareTunnelUrl = ref(false)
const cloudflareTunnelLoading = ref(false)
const copyingRemoteServiceToken = ref(false)
const regeneratingRemoteServiceToken = ref(false)
const remoteServiceLoading = ref(false)
const draftBusy = ref(false)
const deletingId = ref<string | null>(null)
const draftTestResult = ref<RemoteInstanceConnectionResult | null>(null)
const remoteServiceState = ref<RemoteServiceState | null>(null)
const cloudflareTunnelState = ref<CloudflareTunnelState | null>(null)
const remoteNetworkState = ref<RemoteNetworkSettingsState | null>(null)
const cloudflareBinaryPathInput = ref('')
const remoteNetworkLoading = ref(false)
const savingRemoteNetwork = ref(false)
const remoteForm = reactive<RemoteFormState>({
  id: null,
  name: '',
  baseUrl: '',
  token: '',
  enabled: true
})
const remoteServiceForm = reactive<RemoteServiceFormState>({
  enabled: false,
  host: '127.0.0.1',
  port: 18765,
  passthroughOnly: true,
  tokenMode: 'default',
  customToken: ''
})
const remoteNetworkForm = reactive<RemoteNetworkFormState>({
  cloudflareTransportMode: 'auto',
  cloudflareProxyMode: 'auto',
  cloudflareCustomProxyUrl: '',
  cloudflareRememberLastSuccess: true,
  cloudflareAutoFallback: true,
  cliProxyMode: 'auto',
  cliCustomProxyUrl: '',
  cliEnableNoProxyLocalhost: true
})

const isEditingRemote = computed(() => !!remoteForm.id)
const canSubmitRemoteForm = computed(() => {
  return !!remoteForm.name.trim() && !!remoteForm.baseUrl.trim() && !!remoteForm.token.trim()
})
const canSubmitRemoteServiceForm = computed(() => {
  if (!remoteServiceForm.host.trim()) return false
  if (!Number.isFinite(remoteServiceForm.port) || remoteServiceForm.port < 1 || remoteServiceForm.port > 65535) {
    return false
  }
  if (remoteServiceForm.tokenMode !== 'custom') return true
  const token = remoteServiceForm.customToken.trim()
  if (token.length >= 64) return true
  return remoteServiceState.value?.customTokenConfigured === true
})
const busyInstanceIds = computed(() => {
  const ids = [...instancesStore.testingIds]
  if (deletingId.value) ids.push(deletingId.value)
  return ids
})
const hasRemoteServiceEnvOverrides = computed(() => {
  const overrides = remoteServiceState.value?.envOverrides
  return !!overrides && Object.values(overrides).some(Boolean)
})
const remoteServiceEnvOverrideFields = computed(() => {
  const overrides = remoteServiceState.value?.envOverrides
  if (!overrides) return '-'
  const fields: string[] = []
  if (overrides.enabled) fields.push(t('settings.remoteServiceFieldEnabled'))
  if (overrides.host) fields.push(t('settings.remoteServiceFieldHost'))
  if (overrides.port) fields.push(t('settings.remoteServiceFieldPort'))
  if (overrides.passthroughOnly) fields.push(t('settings.remoteServiceFieldPassthroughOnly'))
  if (overrides.token) fields.push(t('settings.remoteServiceFieldToken'))
  return fields.join('、') || '-'
})
const canStartCloudflareTunnel = computed(() => {
  return !!cloudflareTunnelState.value?.available && !!remoteServiceState.value?.running
})
const canSubmitRemoteNetworkForm = computed(() => {
  if (
    remoteNetworkForm.cloudflareProxyMode === 'custom' &&
    !remoteNetworkForm.cloudflareCustomProxyUrl.trim()
  ) {
    return false
  }

  if (remoteNetworkForm.cliProxyMode === 'custom' && !remoteNetworkForm.cliCustomProxyUrl.trim()) {
    return false
  }

  return true
})

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function resetRemoteForm(): void {
  remoteForm.id = null
  remoteForm.name = ''
  remoteForm.baseUrl = ''
  remoteForm.token = ''
  remoteForm.enabled = true
  draftTestResult.value = null
}

function syncRemoteServiceForm(state: RemoteServiceState): void {
  remoteServiceForm.enabled = state.configuredEnabled
  remoteServiceForm.host = state.host
  remoteServiceForm.port = state.port
  remoteServiceForm.passthroughOnly = state.passthroughOnly
  remoteServiceForm.tokenMode = state.tokenMode
  remoteServiceForm.customToken = ''
}

function syncRemoteNetworkForm(state: RemoteNetworkSettingsState): void {
  remoteNetworkForm.cloudflareTransportMode = state.config.cloudflare.transportMode
  remoteNetworkForm.cloudflareProxyMode = state.config.cloudflare.proxyMode
  remoteNetworkForm.cloudflareCustomProxyUrl = state.config.cloudflare.customProxyUrl || ''
  remoteNetworkForm.cloudflareRememberLastSuccess = state.config.cloudflare.rememberLastSuccess
  remoteNetworkForm.cloudflareAutoFallback = state.config.cloudflare.autoFallback
  remoteNetworkForm.cliProxyMode = state.config.cli.proxyMode
  remoteNetworkForm.cliCustomProxyUrl = state.config.cli.customProxyUrl || ''
  remoteNetworkForm.cliEnableNoProxyLocalhost = state.config.cli.enableNoProxyLocalhost
}

function formatStatusText(status: RemoteInstance['status']): string {
  return t(`settings.remoteStatus.${status}`)
}

function formatTokenSource(source: RemoteServiceState['tokenSource']): string {
  return t(`settings.remoteServiceTokenSourceValue.${source}`)
}

function formatCloudflarePathSource(source: CloudflareTunnelState['pathSource']): string {
  return t(`settings.cloudflareTunnelPathSourceValue.${source}`)
}

function formatTransportMode(mode: TunnelTransportMode | TunnelResolvedTransport | null): string {
  if (!mode) return '-'
  return t(`settings.remoteTransportModeValue.${mode}`)
}

function formatProxyMode(mode: ProxyMode | null): string {
  if (!mode) return '-'
  return t(`settings.remoteProxyModeValue.${mode}`)
}

function formatStrategySummary(strategy: CloudflareLaunchStrategyPreview | null): string {
  if (!strategy) return t('settings.remoteNetworkNone')
  const suffix = strategy.proxyUrl ? ` · ${strategy.proxyUrl}` : ''
  return `${formatTransportMode(strategy.transport)} · ${formatProxyMode(strategy.proxyMode)}${suffix}`
}

function formatStrategyList(strategies: CloudflareLaunchStrategyPreview[]): string {
  if (strategies.length === 0) return t('settings.remoteNetworkNone')
  return strategies.map((strategy) => formatStrategySummary(strategy)).join(' | ')
}

function formatCliResolvedSummary(state: CliResolvedProxyState | null): string {
  if (!state) return t('settings.remoteNetworkNone')
  const suffix = state.proxyUrl ? ` · ${state.proxyUrl}` : ''
  return `${formatProxyMode(state.proxyMode)}${suffix}`
}

function formatFailureCategory(category: CloudflareFailureCategory | null): string {
  if (!category) return t('settings.remoteNetworkNone')
  return t(`settings.remoteNetworkFailureCategoryValue.${category}`)
}

function formatCloudflareFailureAdvice(category: CloudflareFailureCategory | null): string {
  if (!category) return t('settings.remoteNetworkNone')
  return t(`settings.remoteNetworkCloudflareAdviceValue.${category}`)
}

function formatCliFailureSource(cli: RemoteNetworkSettingsState['runtime']['cli']['lastFailureCli']): string {
  if (!cli) return t('settings.remoteNetworkNone')
  return t(`settings.remoteNetworkCliFailureCliValue.${cli}`)
}

function formatCliFailureCategory(category: CliFailureCategory | null): string {
  if (!category) return t('settings.remoteNetworkNone')
  return t(`settings.remoteNetworkCliFailureCategoryValue.${category}`)
}

function formatCliFailureAdvice(category: CliFailureCategory | null): string {
  if (!category) return t('settings.remoteNetworkNone')
  return t(`settings.remoteNetworkCliAdviceValue.${category}`)
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function buildCloudflareStartFailureMessage(error: unknown): string {
  const category = remoteNetworkState.value?.runtime.cloudflare.lastFailureCategory ?? null
  const reason =
    remoteNetworkState.value?.runtime.cloudflare.lastFailureReason ||
    cloudflareTunnelState.value?.lastError ||
    toErrorMessage(error)
  const advice = formatCloudflareFailureAdvice(category)
  const categoryLabel = formatFailureCategory(category)

  if (category && advice !== t('settings.remoteNetworkNone')) {
    return `${t('settings.cloudflareTunnelStartFailed')}: ${categoryLabel}。${advice}（${reason}）`
  }

  return `${t('settings.cloudflareTunnelStartFailed')}: ${reason}`
}

function formatLastSuccessfulStrategy(): string {
  const runtime = remoteNetworkState.value?.runtime.cloudflare
  if (!runtime?.lastSuccessfulTransport || !runtime.lastSuccessfulProxyMode) {
    return t('settings.remoteNetworkNone')
  }

  return formatStrategySummary({
    transport: runtime.lastSuccessfulTransport,
    proxyMode: runtime.lastSuccessfulProxyMode,
    proxyUrl: runtime.lastSuccessfulProxyUrl
  })
}

function formatLatencyLabel(
  latencyMs: number | null,
  status: RemoteInstance['status'] | null = null
): string {
  if (latencyMs === null || !Number.isFinite(latencyMs)) {
    if (status === 'offline' || status === 'error') {
      return t('settings.remoteLatencyUnavailable')
    }
    if (status === 'connecting') {
      return t('settings.remoteStatus.connecting')
    }
    return t('settings.remoteLatencyUnknown')
  }
  const rounded = Math.round(latencyMs)
  const grade = rounded <= 120
    ? t('settings.remoteLatencyFast')
    : rounded <= 300
      ? t('settings.remoteLatencyNormal')
      : t('settings.remoteLatencySlow')
  return `${grade} · ${rounded}ms`
}

function formatLastChecked(timestamp: number | null): string {
  if (!timestamp) return t('settings.remoteNeverChecked')
  return new Date(timestamp).toLocaleString()
}

async function handleSave(): Promise<void> {
  try {
    await settingsStore.save()
    toast.success(t('toast.settingsSaved'))
  } catch {
    toast.error(t('toast.settingsSaveFail'))
  }
}

function toggleSessionsListPosition(): void {
  settingsStore.settings.sessionsListPosition = settingsStore.settings.sessionsListPosition === 'left' ? 'top' : 'left'
  void handleSave()
}

async function loadSystemInfo(): Promise<void> {
  try {
    const info = await window.electronAPI.invoke('app:getSystemInfo') as typeof systemInfo.value
    systemInfo.value = info
  } catch {
    // ignore
  }
}

async function loadRemoteInstances(): Promise<void> {
  if (!settingsStore.settings.desktopRemoteMountEnabled) {
    instancesStore.clearRemoteState()
    return
  }
  try {
    await instancesStore.fetchInstances()
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  }
}

async function loadRemoteServiceState(): Promise<void> {
  remoteServiceLoading.value = true
  try {
    const state = await getRemoteServiceState()
    remoteServiceState.value = state
    syncRemoteServiceForm(state)
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    remoteServiceLoading.value = false
  }
}

async function loadCloudflareTunnelState(): Promise<void> {
  cloudflareTunnelLoading.value = true
  try {
    const state = await getCloudflareTunnelState()
    cloudflareTunnelState.value = state
    cloudflareBinaryPathInput.value = state.binaryPath || ''
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    cloudflareTunnelLoading.value = false
  }
}

async function loadRemoteNetworkState(): Promise<void> {
  remoteNetworkLoading.value = true
  try {
    const state = await getRemoteNetworkState()
    remoteNetworkState.value = state
    syncRemoteNetworkForm(state)
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    remoteNetworkLoading.value = false
  }
}

async function handleSaveRemoteService(): Promise<void> {
  if (!canSubmitRemoteServiceForm.value) return
  savingRemoteService.value = true
  try {
    const state = await updateRemoteServiceSettings({
      enabled: remoteServiceForm.enabled,
      host: remoteServiceForm.host.trim(),
      port: remoteServiceForm.port,
      passthroughOnly: remoteServiceForm.passthroughOnly,
      tokenMode: remoteServiceForm.tokenMode,
      customToken:
        remoteServiceForm.tokenMode === 'custom'
          ? remoteServiceForm.customToken.trim() || undefined
          : null
    })
    remoteServiceState.value = state
    syncRemoteServiceForm(state)
    await loadCloudflareTunnelState()
    toast.success(t('toast.settingsSaved'))
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    savingRemoteService.value = false
  }
}

async function handleCopyRemoteServiceToken(): Promise<void> {
  copyingRemoteServiceToken.value = true
  try {
    const token = await getRemoteServiceToken()
    await navigator.clipboard.writeText(token)
    toast.success(t('settings.remoteServiceTokenCopied'))
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    copyingRemoteServiceToken.value = false
  }
}

async function handleRegenerateRemoteServiceToken(): Promise<void> {
  regeneratingRemoteServiceToken.value = true
  try {
    const state = await regenerateRemoteServiceDefaultToken()
    remoteServiceState.value = state
    syncRemoteServiceForm(state)
    await loadCloudflareTunnelState()
    toast.success(t('settings.remoteServiceDefaultTokenRegenerated'))
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    regeneratingRemoteServiceToken.value = false
  }
}

async function handleSaveCloudflareTunnelConfig(): Promise<void> {
  savingCloudflareTunnelConfig.value = true
  try {
    const state = await updateCloudflareTunnelConfig(cloudflareBinaryPathInput.value.trim() || null)
    cloudflareTunnelState.value = state
    cloudflareBinaryPathInput.value = state.binaryPath || ''
    toast.success(t('toast.settingsSaved'))
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    savingCloudflareTunnelConfig.value = false
  }
}

async function handleStartCloudflareTunnel(): Promise<void> {
  startingCloudflareTunnel.value = true
  try {
    const state = await startCloudflareTunnel()
    cloudflareTunnelState.value = state
    cloudflareBinaryPathInput.value = state.binaryPath || ''
    await loadRemoteNetworkState()
    toast.success(t('settings.cloudflareTunnelStarted'))
  } catch (error) {
    await loadCloudflareTunnelState()
    await loadRemoteNetworkState()
    toast.error(buildCloudflareStartFailureMessage(error))
  } finally {
    startingCloudflareTunnel.value = false
  }
}

async function handleStopCloudflareTunnel(): Promise<void> {
  stoppingCloudflareTunnel.value = true
  try {
    const state = await stopCloudflareTunnel()
    cloudflareTunnelState.value = state
    toast.success(t('settings.cloudflareTunnelStoppedToast'))
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    stoppingCloudflareTunnel.value = false
  }
}

async function handleCopyCloudflareTunnelUrl(): Promise<void> {
  if (!cloudflareTunnelState.value?.publicUrl) return
  copyingCloudflareTunnelUrl.value = true
  try {
    await navigator.clipboard.writeText(cloudflareTunnelState.value.publicUrl)
    toast.success(t('settings.cloudflareTunnelUrlCopied'))
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    copyingCloudflareTunnelUrl.value = false
  }
}

async function handleSaveRemoteNetworkSettings(): Promise<void> {
  if (!canSubmitRemoteNetworkForm.value) return
  savingRemoteNetwork.value = true
  try {
    const state = await updateRemoteNetworkSettings({
      cloudflare: {
        transportMode: remoteNetworkForm.cloudflareTransportMode,
        proxyMode: remoteNetworkForm.cloudflareProxyMode,
        customProxyUrl:
          remoteNetworkForm.cloudflareProxyMode === 'custom'
            ? remoteNetworkForm.cloudflareCustomProxyUrl.trim() || null
            : null,
        rememberLastSuccess: remoteNetworkForm.cloudflareRememberLastSuccess,
        autoFallback: remoteNetworkForm.cloudflareAutoFallback
      },
      cli: {
        proxyMode: remoteNetworkForm.cliProxyMode,
        customProxyUrl:
          remoteNetworkForm.cliProxyMode === 'custom'
            ? remoteNetworkForm.cliCustomProxyUrl.trim() || null
            : null,
        enableNoProxyLocalhost: remoteNetworkForm.cliEnableNoProxyLocalhost
      }
    })
    remoteNetworkState.value = state
    syncRemoteNetworkForm(state)
    await loadCloudflareTunnelState()
    toast.success(t('toast.settingsSaved'))
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    savingRemoteNetwork.value = false
  }
}

async function handleRemoteFeatureToggle(): Promise<void> {
  const enabled = settingsStore.settings.desktopRemoteMountEnabled
  try {
    await settingsStore.save()
    if (!enabled) {
      resetRemoteForm()
      instancesStore.clearRemoteState()
      projectsStore.clearRemoteProjects()
      sessionsStore.clearRemoteSessions()
    } else {
      await loadRemoteInstances()
    }
    toast.success(t('toast.settingsSaved'))
  } catch (error) {
    settingsStore.settings.desktopRemoteMountEnabled = !enabled
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  }
}

function buildRemoteDraft(): RemoteInstanceDraft {
  return {
    name: remoteForm.name.trim(),
    baseUrl: normalizeBaseUrl(remoteForm.baseUrl),
    token: remoteForm.token.trim(),
    enabled: remoteForm.enabled
  }
}

async function handleTestDraft(): Promise<void> {
  if (!canSubmitRemoteForm.value) return
  draftBusy.value = true
  try {
    const result = await instancesStore.testRemoteDraft({
      baseUrl: normalizeBaseUrl(remoteForm.baseUrl),
      token: remoteForm.token.trim()
    })
    draftTestResult.value = result
    if (result.ok) {
      toast.success(t('settings.remoteTestSuccess'))
    } else {
      toast.warning(result.error || t('settings.remoteTestFail'))
    }
  } catch (error) {
    draftTestResult.value = null
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    draftBusy.value = false
  }
}

async function handleSaveRemoteInstance(): Promise<void> {
  if (!canSubmitRemoteForm.value) return
  savingRemote.value = true
  try {
    const draft = buildRemoteDraft()
    if (remoteForm.id) {
      await instancesStore.updateRemoteInstance(remoteForm.id, draft)
      toast.success(t('settings.remoteUpdated'))
    } else {
      await instancesStore.addRemoteInstance(draft)
      toast.success(t('settings.remoteAdded'))
    }
    resetRemoteForm()
    await loadRemoteInstances()
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    savingRemote.value = false
  }
}

async function handleEditRemoteInstance(instance: RemoteInstance): Promise<void> {
  try {
    const token = (await instancesStore.getRemoteToken(instance.id)) || ''
    remoteForm.id = instance.id
    remoteForm.name = instance.name
    remoteForm.baseUrl = instance.baseUrl
    remoteForm.token = token
    remoteForm.enabled = instance.enabled
    draftTestResult.value = null
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  }
}

async function handleTestRemoteInstance(id: string): Promise<void> {
  try {
    const result = await instancesStore.testRemoteInstance(id)
    if (result.ok) {
      toast.success(t('settings.remoteTestSuccess'))
    } else {
      toast.warning(result.error || t('settings.remoteTestFail'))
    }
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  }
}

async function handleDeleteRemoteInstance(id: string): Promise<void> {
  if (!confirm(t('settings.remoteDeleteConfirm'))) return
  deletingId.value = id
  try {
    await instancesStore.removeRemoteInstance(id)
    if (remoteForm.id === id) {
      resetRemoteForm()
    }
    toast.success(t('settings.remoteDeleted'))
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    deletingId.value = null
  }
}

onMounted(async () => {
  if (!settingsStore.loaded) await settingsStore.load()
  await Promise.all([
    loadSystemInfo(),
    loadRemoteServiceState(),
    loadCloudflareTunnelState(),
    loadRemoteNetworkState(),
    loadRemoteInstances()
  ])
})

onActivated(() => {
  void loadSystemInfo()
  void loadRemoteServiceState()
  void loadCloudflareTunnelState()
  void loadRemoteNetworkState()
  void loadRemoteInstances()
})
</script>

<style scoped lang="scss">
.settings-page {
  padding: var(--spacing-xl);
  max-width: 980px;

  h1 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--spacing-xl);
  }
}

.settings-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);

  h2 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--spacing-md);
    color: var(--text-secondary);
  }
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.section-hint {
  margin: 4px 0 0;
}

.instance-summary {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.summary-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.summary-pill.online {
  color: var(--accent-primary);
  border-color: rgba(108, 158, 255, 0.35);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: 10px 0;

  & + .setting-row {
    border-top: 1px solid rgba(45, 53, 72, 0.5);
  }

  label {
    font-size: var(--font-size-md);
    color: var(--text-primary);
  }

  select,
  input {
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: var(--font-size-sm);
    min-width: 200px;

    &:focus {
      outline: none;
      border-color: var(--accent-primary);
    }

    &:disabled {
      opacity: 0.5;
    }
  }

  input[type='number'] {
    width: 120px;
    min-width: auto;
  }

  input[type='checkbox'] {
    width: 18px;
    min-width: auto;
    height: 18px;
    padding: 0;
    accent-color: var(--accent-primary);
  }
}

.setting-row-stack {
  align-items: flex-start;
}

.setting-label-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.remote-toggle-row {
  margin-bottom: var(--spacing-md);
}

.remote-disabled-state {
  padding: var(--spacing-md);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
  background: rgba(108, 158, 255, 0.05);
  color: var(--text-secondary);
  line-height: 1.6;
}

.remote-form-panel {
  background: linear-gradient(180deg, rgba(108, 158, 255, 0.06), rgba(108, 158, 255, 0.02));
  border: 1px solid rgba(108, 158, 255, 0.18);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.remote-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-md);
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  input,
  select {
    width: 100%;
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    font-size: var(--font-size-sm);

    &:focus {
      outline: none;
      border-color: var(--accent-primary);
    }
  }
}

.field-block-wide {
  grid-column: 1 / -1;
}

.field-block-inline {
  justify-content: flex-end;
}

.field-block-inline-start {
  justify-content: flex-start;
}

.checkbox-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);

  input {
    width: 16px;
    height: 16px;
    accent-color: var(--accent-primary);
  }
}

.remote-form-actions {
  display: flex;
  gap: 8px;
  margin-top: var(--spacing-md);
  flex-wrap: wrap;
}

.draft-result {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: var(--spacing-md);
  padding: 10px 12px;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.draft-result.ok {
  background: rgba(73, 179, 126, 0.1);
  border: 1px solid rgba(73, 179, 126, 0.25);
}

.draft-result.error {
  background: rgba(219, 83, 83, 0.1);
  border: 1px solid rgba(219, 83, 83, 0.25);
}

.draft-result-error {
  color: #f2a6a6;
}

.inline-hint {
  padding: 0;
}

.remote-service-env-note {
  margin-bottom: var(--spacing-md);
}

.remote-empty-state {
  padding: var(--spacing-lg);
  text-align: center;
  color: var(--text-muted);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-lg);
}

.remote-instance-list {
  display: grid;
  gap: var(--spacing-md);
}

.remote-instance-card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-primary);
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.remote-instance-card.disabled {
  opacity: 0.72;
}

.remote-card-head {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-md);
  align-items: flex-start;
}

.remote-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    color: var(--text-primary);
  }
}

.remote-card-url {
  margin: 8px 0 0;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  word-break: break-all;
}

.remote-card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.status-badge,
.mode-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid transparent;
}

.status-badge.status-online {
  background: rgba(73, 179, 126, 0.12);
  color: #83d7aa;
  border-color: rgba(73, 179, 126, 0.25);
}

.status-badge.status-offline,
.status-badge.status-error {
  background: rgba(219, 83, 83, 0.12);
  color: #f2a6a6;
  border-color: rgba(219, 83, 83, 0.25);
}

.status-badge.status-connecting,
.status-badge.status-unknown {
  background: rgba(245, 179, 69, 0.12);
  color: #f5c987;
  border-color: rgba(245, 179, 69, 0.25);
}

.mode-badge {
  background: rgba(108, 158, 255, 0.08);
  color: var(--text-secondary);
  border-color: rgba(108, 158, 255, 0.2);
}

.mode-badge.muted {
  background: rgba(58, 68, 89, 0.5);
  color: var(--text-muted);
  border-color: var(--border-color);
}

.remote-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
}

.meta-item-full {
  grid-column: 1 / -1;
}

.meta-label {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.meta-value {
  color: var(--text-primary);
  font-size: var(--font-size-sm);
}

.meta-value.mono,
.about-value {
  font-family: var(--font-mono);
}

.error-text {
  color: #f2a6a6;
  word-break: break-word;
}

.toggle-btn {
  min-width: 36px;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;

  &:hover {
    background: var(--bg-hover);
  }
}

.setting-hint {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  padding: 0 0 var(--spacing-xs);
}

.about-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-sm);
}

.about-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--spacing-sm);
  background: var(--bg-primary);
  border-radius: var(--radius-md);
}

.about-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.about-value {
  font-size: var(--font-size-sm);
}

@media (max-width: 960px) {
  .settings-page {
    max-width: none;
  }

  .section-head,
  .remote-card-head,
  .setting-row {
    flex-direction: column;
    align-items: stretch;
  }

  .remote-form-grid,
  .remote-card-grid,
  .about-grid {
    grid-template-columns: 1fr;
  }

  .field-block-wide,
  .meta-item-full {
    grid-column: auto;
  }
}
</style>
