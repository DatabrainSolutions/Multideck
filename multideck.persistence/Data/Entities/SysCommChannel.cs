using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommChannel
{
    public string CommChannelCode { get; set; } = null!;

    public string CommChannelName { get; set; } = null!;

    public string? CommChannelDescription { get; set; }

    public int CommChannelSortOrder { get; set; }

    public bool CommChannelIsActive { get; set; }

    public DateTime CommChannelCreatedAt { get; set; }

    public virtual ICollection<CommAiautomationPolicy> CommAiautomationPolicies { get; set; } = new List<CommAiautomationPolicy>();

    public virtual ICollection<CommAidraftResponse> CommAidraftResponses { get; set; } = new List<CommAidraftResponse>();

    public virtual ICollection<CommConsentPreference> CommConsentPreferences { get; set; } = new List<CommConsentPreference>();

    public virtual ICollection<CommIdentity> CommIdentities { get; set; } = new List<CommIdentity>();

    public virtual ICollection<CommInboundEvent> CommInboundEvents { get; set; } = new List<CommInboundEvent>();

    public virtual ICollection<CommMailbox> CommMailboxes { get; set; } = new List<CommMailbox>();

    public virtual ICollection<CommMessageRecipient> CommMessageRecipients { get; set; } = new List<CommMessageRecipient>();

    public virtual ICollection<CommMessageTemplate> CommMessageTemplates { get; set; } = new List<CommMessageTemplate>();

    public virtual ICollection<CommMessage> CommMessages { get; set; } = new List<CommMessage>();

    public virtual ICollection<CommProviderConnection> CommProviderConnections { get; set; } = new List<CommProviderConnection>();

    public virtual ICollection<CommRoutingRule> CommRoutingRules { get; set; } = new List<CommRoutingRule>();

    public virtual ICollection<CommSendRequestRecipient> CommSendRequestRecipients { get; set; } = new List<CommSendRequestRecipient>();

    public virtual ICollection<CommSendRequest> CommSendRequests { get; set; } = new List<CommSendRequest>();

    public virtual ICollection<CommSuppressionList> CommSuppressionLists { get; set; } = new List<CommSuppressionList>();

    public virtual ICollection<CommThread> CommThreads { get; set; } = new List<CommThread>();

    public virtual ICollection<CommUserNotificationPreference> CommUserNotificationPreferences { get; set; } = new List<CommUserNotificationPreference>();

    public virtual ICollection<CrmActivityWorkflowRule> CrmActivityWorkflowRules { get; set; } = new List<CrmActivityWorkflowRule>();

    public virtual ICollection<CrmAutomationPlaybook> CrmAutomationPlaybooks { get; set; } = new List<CrmAutomationPlaybook>();

    public virtual ICollection<CrmCustomerEngagementPreference> CrmCustomerEngagementPreferences { get; set; } = new List<CrmCustomerEngagementPreference>();

    public virtual ICollection<CrmDataRequest> CrmDataRequests { get; set; } = new List<CrmDataRequest>();

    public virtual ICollection<CrmMessageVariationHistory> CrmMessageVariationHistories { get; set; } = new List<CrmMessageVariationHistory>();

    public virtual ICollection<CrmPersonalMessageDraft> CrmPersonalMessageDrafts { get; set; } = new List<CrmPersonalMessageDraft>();

    public virtual ICollection<CrmQuickTaskOption> CrmQuickTaskOptions { get; set; } = new List<CrmQuickTaskOption>();
}
