using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysSubmoduleCode
{
    public string SubmoduleCode { get; set; } = null!;

    public string SubmoduleName { get; set; } = null!;

    public string? SubmoduleDescription { get; set; }

    public bool SubmoduleIsMvp { get; set; }

    public bool SubmoduleIsActive { get; set; }

    public int SubmoduleSortOrder { get; set; }

    public virtual ICollection<ObsAiactionLog> ObsAiactionLogs { get; set; } = new List<ObsAiactionLog>();

    public virtual ICollection<ObsBackgroundJob> ObsBackgroundJobs { get; set; } = new List<ObsBackgroundJob>();

    public virtual ICollection<ObsDataQualityIssue> ObsDataQualityIssues { get; set; } = new List<ObsDataQualityIssue>();

    public virtual ICollection<ObsExceptionQueue> ObsExceptionQueues { get; set; } = new List<ObsExceptionQueue>();

    public virtual ICollection<ObsIntegrationEvent> ObsIntegrationEvents { get; set; } = new List<ObsIntegrationEvent>();

    public virtual ICollection<ObsRetryQueue> ObsRetryQueues { get; set; } = new List<ObsRetryQueue>();

    public virtual ICollection<ObsServiceHealthCheck> ObsServiceHealthChecks { get; set; } = new List<ObsServiceHealthCheck>();

    public virtual ICollection<ObsWebhookInbox> ObsWebhookInboxes { get; set; } = new List<ObsWebhookInbox>();

    public virtual ICollection<RptDashboard> RptDashboards { get; set; } = new List<RptDashboard>();

    public virtual ICollection<RptKpi> RptKpis { get; set; } = new List<RptKpi>();

    public virtual ICollection<RptReportDefinition> RptReportDefinitions { get; set; } = new List<RptReportDefinition>();

    public virtual ICollection<SecApiclientScope> SecApiclientScopes { get; set; } = new List<SecApiclientScope>();

    public virtual ICollection<SecCredentialReference> SecCredentialReferences { get; set; } = new List<SecCredentialReference>();

    public virtual ICollection<SecOfficeVisibilityPolicy> SecOfficeVisibilityPolicies { get; set; } = new List<SecOfficeVisibilityPolicy>();

    public virtual ICollection<SecPermission> SecPermissions { get; set; } = new List<SecPermission>();

    public virtual ICollection<SecRoleScope> SecRoleScopes { get; set; } = new List<SecRoleScope>();

    public virtual ICollection<SecSensitiveField> SecSensitiveFields { get; set; } = new List<SecSensitiveField>();

    public virtual ICollection<SubAdminNotice> SubAdminNotices { get; set; } = new List<SubAdminNotice>();

    public virtual ICollection<SubFeatureFlag> SubFeatureFlags { get; set; } = new List<SubFeatureFlag>();

    public virtual ICollection<SubModuleEntitlement> SubModuleEntitlements { get; set; } = new List<SubModuleEntitlement>();

    public virtual ICollection<SubPlanModule> SubPlanModules { get; set; } = new List<SubPlanModule>();

    public virtual ICollection<SubUsageMeter> SubUsageMeters { get; set; } = new List<SubUsageMeter>();
}
