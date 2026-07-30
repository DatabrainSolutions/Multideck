using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CmpUser
{
    public Guid UserId { get; set; }

    public Guid? CompanyId { get; set; }

    public string? UserFirstname { get; set; }

    public string? UserLastname { get; set; }

    public string UserEmail { get; set; } = null!;

    public string? UserJobTitle { get; set; }

    public Guid? AuthUserId { get; set; }

    public string? UserProfilePhotoBucket { get; set; }

    public string? UserProfilePhotoPath { get; set; }

    public string? UserProfilePhotoMimeType { get; set; }

    public long? UserProfilePhotoSizeBytes { get; set; }

    public DateTime? UserProfilePhotoUpdatedAt { get; set; }

    public string? UserCoverPhotoBucket { get; set; }

    public string? UserCoverPhotoPath { get; set; }

    public string? UserCoverPhotoMimeType { get; set; }

    public long? UserCoverPhotoSizeBytes { get; set; }

    public DateTime? UserCoverPhotoUpdatedAt { get; set; }

    public bool? UserSidebarCollapsed { get; set; }

    public string? UserSidebarLayout { get; set; }

    public virtual ICollection<AcciConnection> AcciConnectionAccicCreatedByNavigations { get; set; } = new List<AcciConnection>();

    public virtual ICollection<AcciConnection> AcciConnectionAccicUpdatedByNavigations { get; set; } = new List<AcciConnection>();

    public virtual ICollection<AcciExportBatch> AcciExportBatchAcciebApprovedByNavigations { get; set; } = new List<AcciExportBatch>();

    public virtual ICollection<AcciExportBatch> AcciExportBatchAcciebCreatedByNavigations { get; set; } = new List<AcciExportBatch>();

    public virtual ICollection<AcciReconciliationIssue> AcciReconciliationIssues { get; set; } = new List<AcciReconciliationIssue>();

    public virtual ICollection<AcciSyncRun> AcciSyncRuns { get; set; } = new List<AcciSyncRun>();

    public virtual ICollection<AiContextRule> AiContextRules { get; set; } = new List<AiContextRule>();

    public virtual ICollection<AiContextStoreScope> AiContextStoreScopes { get; set; } = new List<AiContextStoreScope>();

    public virtual ICollection<AiConversationParticipant> AiConversationParticipants { get; set; } = new List<AiConversationParticipant>();

    public virtual ICollection<AiConversation> AiConversations { get; set; } = new List<AiConversation>();

    public virtual ICollection<AiMessage> AiMessages { get; set; } = new List<AiMessage>();

    public virtual ICollection<AuditAccessEvent> AuditAccessEvents { get; set; } = new List<AuditAccessEvent>();

    public virtual ICollection<AuditEvent> AuditEvents { get; set; } = new List<AuditEvent>();

    public virtual ICollection<AuditExportEvent> AuditExportEvents { get; set; } = new List<AuditExportEvent>();

    public virtual ICollection<AuditRequestContext> AuditRequestContexts { get; set; } = new List<AuditRequestContext>();

    public virtual ICollection<AuditRetentionJob> AuditRetentionJobs { get; set; } = new List<AuditRetentionJob>();

    public virtual ICollection<AuditReviewCase> AuditReviewCaseAuditReviewAssignedToUsers { get; set; } = new List<AuditReviewCase>();

    public virtual ICollection<AuditReviewCase> AuditReviewCaseAuditReviewClosedByNavigations { get; set; } = new List<AuditReviewCase>();

    public virtual ICollection<AuditReviewCase> AuditReviewCaseAuditReviewOpenedByNavigations { get; set; } = new List<AuditReviewCase>();

    public virtual ICollection<AuditReviewCaseEvent> AuditReviewCaseEvents { get; set; } = new List<AuditReviewCaseEvent>();

    public virtual ICollection<AuditTablePolicy> AuditTablePolicyAuditPolicyCreatedByNavigations { get; set; } = new List<AuditTablePolicy>();

    public virtual ICollection<AuditTablePolicy> AuditTablePolicyAuditPolicyUpdatedByNavigations { get; set; } = new List<AuditTablePolicy>();

    public virtual ICollection<BlSecurityControl> BlSecurityControlBlscCreatedByNavigations { get; set; } = new List<BlSecurityControl>();

    public virtual ICollection<BlSecurityControl> BlSecurityControlBlscRevokedByNavigations { get; set; } = new List<BlSecurityControl>();

    public virtual ICollection<BlSecurityControl> BlSecurityControlBlscUpdatedByNavigations { get; set; } = new List<BlSecurityControl>();

    public virtual ICollection<ClmAiinsight> ClmAiinsights { get; set; } = new List<ClmAiinsight>();

    public virtual ICollection<ClmClaimApproval> ClmClaimApprovalClmapprovalApproverUsers { get; set; } = new List<ClmClaimApproval>();

    public virtual ICollection<ClmClaimApproval> ClmClaimApprovalClmapprovalRequestedByNavigations { get; set; } = new List<ClmClaimApproval>();

    public virtual ICollection<ClmClaim> ClmClaimClmclaimCreatedByNavigations { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmClaim> ClmClaimClmclaimOwnerUsers { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmClaim> ClmClaimClmclaimUpdatedByNavigations { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmClaimDocument> ClmClaimDocuments { get; set; } = new List<ClmClaimDocument>();

    public virtual ICollection<ClmClaimEvent> ClmClaimEvents { get; set; } = new List<ClmClaimEvent>();

    public virtual ICollection<ClmClaimFinancialLink> ClmClaimFinancialLinks { get; set; } = new List<ClmClaimFinancialLink>();

    public virtual ICollection<ClmClaimLine> ClmClaimLines { get; set; } = new List<ClmClaimLine>();

    public virtual ICollection<ClmClaimRecovery> ClmClaimRecoveryClmrecoveryCreatedByNavigations { get; set; } = new List<ClmClaimRecovery>();

    public virtual ICollection<ClmClaimRecovery> ClmClaimRecoveryClmrecoveryUpdatedByNavigations { get; set; } = new List<ClmClaimRecovery>();

    public virtual ICollection<ClmClaimReserf> ClmClaimReserfClmreserveApprovedByNavigations { get; set; } = new List<ClmClaimReserf>();

    public virtual ICollection<ClmClaimReserf> ClmClaimReserfClmreserveCreatedByNavigations { get; set; } = new List<ClmClaimReserf>();

    public virtual ICollection<ClmClaimTask> ClmClaimTaskClmtaskAssignedUsers { get; set; } = new List<ClmClaimTask>();

    public virtual ICollection<ClmClaimTask> ClmClaimTaskClmtaskCompletedByNavigations { get; set; } = new List<ClmClaimTask>();

    public virtual ICollection<ClmClaimTask> ClmClaimTaskClmtaskCreatedByNavigations { get; set; } = new List<ClmClaimTask>();

    public virtual ICollection<ClmEvidenceItem> ClmEvidenceItemClmevidenceCreatedByNavigations { get; set; } = new List<ClmEvidenceItem>();

    public virtual ICollection<ClmEvidenceItem> ClmEvidenceItemClmevidenceVerifiedByNavigations { get; set; } = new List<ClmEvidenceItem>();

    public virtual ICollection<ClmIncidentAction> ClmIncidentActionClmincActionAssignedUsers { get; set; } = new List<ClmIncidentAction>();

    public virtual ICollection<ClmIncidentAction> ClmIncidentActionClmincActionCompletedByNavigations { get; set; } = new List<ClmIncidentAction>();

    public virtual ICollection<ClmIncidentAction> ClmIncidentActionClmincActionCreatedByNavigations { get; set; } = new List<ClmIncidentAction>();

    public virtual ICollection<ClmIncident> ClmIncidentClmincidentCreatedByNavigations { get; set; } = new List<ClmIncident>();

    public virtual ICollection<ClmIncident> ClmIncidentClmincidentOwnerUsers { get; set; } = new List<ClmIncident>();

    public virtual ICollection<ClmIncident> ClmIncidentClmincidentUpdatedByNavigations { get; set; } = new List<ClmIncident>();

    public virtual ICollection<ClmInsuranceNotification> ClmInsuranceNotifications { get; set; } = new List<ClmInsuranceNotification>();

    public virtual ICollection<ClmInsurancePolicy> ClmInsurancePolicyClmpolicyCreatedByNavigations { get; set; } = new List<ClmInsurancePolicy>();

    public virtual ICollection<ClmInsurancePolicy> ClmInsurancePolicyClmpolicyUpdatedByNavigations { get; set; } = new List<ClmInsurancePolicy>();

    public virtual ICollection<ClmKpiresult> ClmKpiresults { get; set; } = new List<ClmKpiresult>();

    public virtual ICollection<ClmPolicyCoverage> ClmPolicyCoverages { get; set; } = new List<ClmPolicyCoverage>();

    public virtual ICollection<ClmPolicyDocument> ClmPolicyDocuments { get; set; } = new List<ClmPolicyDocument>();

    public virtual ICollection<ClmPolicyRenewal> ClmPolicyRenewalClmrenewalAssignedUsers { get; set; } = new List<ClmPolicyRenewal>();

    public virtual ICollection<ClmPolicyRenewal> ClmPolicyRenewalClmrenewalCreatedByNavigations { get; set; } = new List<ClmPolicyRenewal>();

    public virtual ICollection<ClmSurveyAppointment> ClmSurveyAppointments { get; set; } = new List<ClmSurveyAppointment>();

    public virtual ICollection<CommAiautomationPolicy> CommAiautomationPolicyCommAipolicyApprovedByNavigations { get; set; } = new List<CommAiautomationPolicy>();

    public virtual ICollection<CommAiautomationPolicy> CommAiautomationPolicyCommAipolicyCreatedByNavigations { get; set; } = new List<CommAiautomationPolicy>();

    public virtual ICollection<CommAiautomationPolicy> CommAiautomationPolicyCommAipolicyUpdatedByNavigations { get; set; } = new List<CommAiautomationPolicy>();

    public virtual ICollection<CommAiclassification> CommAiclassificationCommAiReviewedByNavigations { get; set; } = new List<CommAiclassification>();

    public virtual ICollection<CommAiclassification> CommAiclassificationCommAiSuggestedUsers { get; set; } = new List<CommAiclassification>();

    public virtual ICollection<CommAidraftResponse> CommAidraftResponses { get; set; } = new List<CommAidraftResponse>();

    public virtual ICollection<CommCallLog> CommCallLogs { get; set; } = new List<CommCallLog>();

    public virtual ICollection<CommConsentPreference> CommConsentPreferences { get; set; } = new List<CommConsentPreference>();

    public virtual ICollection<CommFederationPeer> CommFederationPeerCommPeerCreatedByNavigations { get; set; } = new List<CommFederationPeer>();

    public virtual ICollection<CommFederationPeer> CommFederationPeerCommPeerUpdatedByNavigations { get; set; } = new List<CommFederationPeer>();

    public virtual ICollection<CommFederationSubscription> CommFederationSubscriptions { get; set; } = new List<CommFederationSubscription>();

    public virtual ICollection<CommIdentity> CommIdentities { get; set; } = new List<CommIdentity>();

    public virtual ICollection<CommMailbox> CommMailboxCommMailboxCreatedByNavigations { get; set; } = new List<CommMailbox>();

    public virtual ICollection<CommMailbox> CommMailboxCommMailboxUpdatedByNavigations { get; set; } = new List<CommMailbox>();

    public virtual ICollection<CommMailbox> CommMailboxCommMailboxUsers { get; set; } = new List<CommMailbox>();

    public virtual ICollection<CommMessageAttachment> CommMessageAttachments { get; set; } = new List<CommMessageAttachment>();

    public virtual ICollection<CommMessage> CommMessageCommMessageCreatedByNavigations { get; set; } = new List<CommMessage>();

    public virtual ICollection<CommMessage> CommMessageCommMessageUpdatedByNavigations { get; set; } = new List<CommMessage>();

    public virtual ICollection<CommMessageLink> CommMessageLinks { get; set; } = new List<CommMessageLink>();

    public virtual ICollection<CommMessageReaction> CommMessageReactions { get; set; } = new List<CommMessageReaction>();

    public virtual ICollection<CommMessageRecipient> CommMessageRecipients { get; set; } = new List<CommMessageRecipient>();

    public virtual ICollection<CommMessageTemplate> CommMessageTemplateCommTemplateCreatedByNavigations { get; set; } = new List<CommMessageTemplate>();

    public virtual ICollection<CommMessageTemplate> CommMessageTemplateCommTemplateUpdatedByNavigations { get; set; } = new List<CommMessageTemplate>();

    public virtual ICollection<CommMessageTemplateVersion> CommMessageTemplateVersionCommTemplateVerApprovedByNavigations { get; set; } = new List<CommMessageTemplateVersion>();

    public virtual ICollection<CommMessageTemplateVersion> CommMessageTemplateVersionCommTemplateVerCreatedByNavigations { get; set; } = new List<CommMessageTemplateVersion>();

    public virtual ICollection<CommNotification> CommNotificationCommNotifCreatedByNavigations { get; set; } = new List<CommNotification>();

    public virtual ICollection<CommNotification> CommNotificationCommNotifUsers { get; set; } = new List<CommNotification>();

    public virtual ICollection<CommProviderConnection> CommProviderConnectionCommConnCreatedByNavigations { get; set; } = new List<CommProviderConnection>();

    public virtual ICollection<CommProviderConnection> CommProviderConnectionCommConnUpdatedByNavigations { get; set; } = new List<CommProviderConnection>();

    public virtual ICollection<CommProviderConnection> CommProviderConnectionCommConnUsers { get; set; } = new List<CommProviderConnection>();

    public virtual ICollection<CommReadState> CommReadStates { get; set; } = new List<CommReadState>();

    public virtual ICollection<CommRoutingRule> CommRoutingRuleCommRuleAssignUsers { get; set; } = new List<CommRoutingRule>();

    public virtual ICollection<CommRoutingRule> CommRoutingRuleCommRuleCreatedByNavigations { get; set; } = new List<CommRoutingRule>();

    public virtual ICollection<CommRoutingRule> CommRoutingRuleCommRuleUpdatedByNavigations { get; set; } = new List<CommRoutingRule>();

    public virtual ICollection<CommSendRequest> CommSendRequestCommSendApprovedByNavigations { get; set; } = new List<CommSendRequest>();

    public virtual ICollection<CommSendRequest> CommSendRequestCommSendRequestedByNavigations { get; set; } = new List<CommSendRequest>();

    public virtual ICollection<CommSendRequestRecipient> CommSendRequestRecipients { get; set; } = new List<CommSendRequestRecipient>();

    public virtual ICollection<CommSuppressionList> CommSuppressionLists { get; set; } = new List<CommSuppressionList>();

    public virtual ICollection<CommThreadAssignment> CommThreadAssignmentCommAssignAssignedByNavigations { get; set; } = new List<CommThreadAssignment>();

    public virtual ICollection<CommThreadAssignment> CommThreadAssignmentCommAssignFromUsers { get; set; } = new List<CommThreadAssignment>();

    public virtual ICollection<CommThreadAssignment> CommThreadAssignmentCommAssignToUsers { get; set; } = new List<CommThreadAssignment>();

    public virtual ICollection<CommThread> CommThreadCommThreadAssignedUsers { get; set; } = new List<CommThread>();

    public virtual ICollection<CommThread> CommThreadCommThreadCreatedByNavigations { get; set; } = new List<CommThread>();

    public virtual ICollection<CommThread> CommThreadCommThreadOwnerUsers { get; set; } = new List<CommThread>();

    public virtual ICollection<CommThread> CommThreadCommThreadUpdatedByNavigations { get; set; } = new List<CommThread>();

    public virtual ICollection<CommThreadLink> CommThreadLinks { get; set; } = new List<CommThreadLink>();

    public virtual ICollection<CommThreadParticipant> CommThreadParticipants { get; set; } = new List<CommThreadParticipant>();

    public virtual ICollection<CommUserNotificationPreference> CommUserNotificationPreferences { get; set; } = new List<CommUserNotificationPreference>();

    public virtual CmpCompany? Company { get; set; }

    public virtual ICollection<CrmAccountAssignment> CrmAccountAssignmentCrmaccountAssignCreatedByNavigations { get; set; } = new List<CrmAccountAssignment>();

    public virtual ICollection<CrmAccountAssignment> CrmAccountAssignmentCrmaccountAssignUsers { get; set; } = new List<CrmAccountAssignment>();

    public virtual ICollection<CrmAccountProfile> CrmAccountProfileCrmaccountCreatedByNavigations { get; set; } = new List<CrmAccountProfile>();

    public virtual ICollection<CrmAccountProfile> CrmAccountProfileCrmaccountOwnerUsers { get; set; } = new List<CrmAccountProfile>();

    public virtual ICollection<CrmAccountProfile> CrmAccountProfileCrmaccountUpdatedByNavigations { get; set; } = new List<CrmAccountProfile>();

    public virtual ICollection<CrmActivity> CrmActivityCrmactivityCreatedByNavigations { get; set; } = new List<CrmActivity>();

    public virtual ICollection<CrmActivity> CrmActivityCrmactivityOwnerUsers { get; set; } = new List<CrmActivity>();

    public virtual ICollection<CrmActivity> CrmActivityCrmactivityUpdatedByNavigations { get; set; } = new List<CrmActivity>();

    public virtual ICollection<CrmActivityParticipant> CrmActivityParticipants { get; set; } = new List<CrmActivityParticipant>();

    public virtual ICollection<CrmActivityWorkflowRule> CrmActivityWorkflowRuleCrmawruleCreatedByNavigations { get; set; } = new List<CrmActivityWorkflowRule>();

    public virtual ICollection<CrmActivityWorkflowRule> CrmActivityWorkflowRuleCrmawruleDefaultOwnerUsers { get; set; } = new List<CrmActivityWorkflowRule>();

    public virtual ICollection<CrmActivityWorkflowRule> CrmActivityWorkflowRuleCrmawruleUpdatedByNavigations { get; set; } = new List<CrmActivityWorkflowRule>();

    public virtual ICollection<CrmActivityWorkflowRun> CrmActivityWorkflowRunCrmawrunCompletedByNavigations { get; set; } = new List<CrmActivityWorkflowRun>();

    public virtual ICollection<CrmActivityWorkflowRun> CrmActivityWorkflowRunCrmawrunCreatedByNavigations { get; set; } = new List<CrmActivityWorkflowRun>();

    public virtual ICollection<CrmActivityWorkflowRun> CrmActivityWorkflowRunCrmawrunOwnerUsers { get; set; } = new List<CrmActivityWorkflowRun>();

    public virtual ICollection<CrmAifocusArea> CrmAifocusAreaCrmfocusDecidedByNavigations { get; set; } = new List<CrmAifocusArea>();

    public virtual ICollection<CrmAifocusArea> CrmAifocusAreaCrmfocusTargetUsers { get; set; } = new List<CrmAifocusArea>();

    public virtual ICollection<CrmAiinsight> CrmAiinsightCrmaiinsightReviewedByNavigations { get; set; } = new List<CrmAiinsight>();

    public virtual ICollection<CrmAiinsight> CrmAiinsightCrmaiinsightTargetUsers { get; set; } = new List<CrmAiinsight>();

    public virtual ICollection<CrmAiinsightRule> CrmAiinsightRules { get; set; } = new List<CrmAiinsightRule>();

    public virtual ICollection<CrmAutomationPlaybook> CrmAutomationPlaybookCrmautoPlaybookCreatedByNavigations { get; set; } = new List<CrmAutomationPlaybook>();

    public virtual ICollection<CrmAutomationPlaybook> CrmAutomationPlaybookCrmautoPlaybookUpdatedByNavigations { get; set; } = new List<CrmAutomationPlaybook>();

    public virtual ICollection<CrmAutomationRun> CrmAutomationRunCrmautoRunAssignedUsers { get; set; } = new List<CrmAutomationRun>();

    public virtual ICollection<CrmAutomationRun> CrmAutomationRunCrmautoRunCompletedByNavigations { get; set; } = new List<CrmAutomationRun>();

    public virtual ICollection<CrmAutomationRun> CrmAutomationRunCrmautoRunStartedByNavigations { get; set; } = new List<CrmAutomationRun>();

    public virtual ICollection<CrmCallActionCandidate> CrmCallActionCandidateCrmcallActionDecidedByNavigations { get; set; } = new List<CrmCallActionCandidate>();

    public virtual ICollection<CrmCallActionCandidate> CrmCallActionCandidateCrmcallActionSuggestedOwnerUsers { get; set; } = new List<CrmCallActionCandidate>();

    public virtual ICollection<CrmCallReview> CrmCallReviewCrmcallReviewCreatedByNavigations { get; set; } = new List<CrmCallReview>();

    public virtual ICollection<CrmCallReview> CrmCallReviewCrmcallReviewOwnerUsers { get; set; } = new List<CrmCallReview>();

    public virtual ICollection<CrmCallReview> CrmCallReviewCrmcallReviewReviewedByNavigations { get; set; } = new List<CrmCallReview>();

    public virtual ICollection<CrmCallReviewDecision> CrmCallReviewDecisions { get; set; } = new List<CrmCallReviewDecision>();

    public virtual ICollection<CrmCallSummaryNote> CrmCallSummaryNotes { get; set; } = new List<CrmCallSummaryNote>();

    public virtual ICollection<CrmCampaign> CrmCampaignCrmcampaignCreatedByNavigations { get; set; } = new List<CrmCampaign>();

    public virtual ICollection<CrmCampaign> CrmCampaignCrmcampaignOwnerUsers { get; set; } = new List<CrmCampaign>();

    public virtual ICollection<CrmContactProfile> CrmContactProfileCrmcontactCreatedByNavigations { get; set; } = new List<CrmContactProfile>();

    public virtual ICollection<CrmContactProfile> CrmContactProfileCrmcontactUpdatedByNavigations { get; set; } = new List<CrmContactProfile>();

    public virtual ICollection<CrmDataCaptureResponse> CrmDataCaptureResponses { get; set; } = new List<CrmDataCaptureResponse>();

    public virtual ICollection<CrmDataCaptureSession> CrmDataCaptureSessions { get; set; } = new List<CrmDataCaptureSession>();

    public virtual ICollection<CrmDataRequest> CrmDataRequestCrmdataReqAssignedUsers { get; set; } = new List<CrmDataRequest>();

    public virtual ICollection<CrmDataRequest> CrmDataRequestCrmdataReqCreatedByNavigations { get; set; } = new List<CrmDataRequest>();

    public virtual ICollection<CrmDataRequestResponse> CrmDataRequestResponses { get; set; } = new List<CrmDataRequestResponse>();

    public virtual ICollection<CrmDuplicateCandidate> CrmDuplicateCandidates { get; set; } = new List<CrmDuplicateCandidate>();

    public virtual ICollection<CrmFieldUpdateAudit> CrmFieldUpdateAudits { get; set; } = new List<CrmFieldUpdateAudit>();

    public virtual ICollection<CrmFieldUpdateQueue> CrmFieldUpdateQueueCrmfieldUpdateAppliedByNavigations { get; set; } = new List<CrmFieldUpdateQueue>();

    public virtual ICollection<CrmFieldUpdateQueue> CrmFieldUpdateQueueCrmfieldUpdateCreatedByNavigations { get; set; } = new List<CrmFieldUpdateQueue>();

    public virtual ICollection<CrmFieldUpdateQueue> CrmFieldUpdateQueueCrmfieldUpdateReviewedByNavigations { get; set; } = new List<CrmFieldUpdateQueue>();

    public virtual ICollection<CrmInboundReplyMatch> CrmInboundReplyMatches { get; set; } = new List<CrmInboundReplyMatch>();

    public virtual ICollection<CrmKpitarget> CrmKpitargets { get; set; } = new List<CrmKpitarget>();

    public virtual ICollection<CrmLeadAssignment> CrmLeadAssignmentCrmleadAssignAssignedByNavigations { get; set; } = new List<CrmLeadAssignment>();

    public virtual ICollection<CrmLeadAssignment> CrmLeadAssignmentCrmleadAssignAssignedUsers { get; set; } = new List<CrmLeadAssignment>();

    public virtual ICollection<CrmLeadConversion> CrmLeadConversions { get; set; } = new List<CrmLeadConversion>();

    public virtual ICollection<CrmLead> CrmLeadCrmleadCreatedByNavigations { get; set; } = new List<CrmLead>();

    public virtual ICollection<CrmLead> CrmLeadCrmleadOwnerUsers { get; set; } = new List<CrmLead>();

    public virtual ICollection<CrmLead> CrmLeadCrmleadUpdatedByNavigations { get; set; } = new List<CrmLead>();

    public virtual ICollection<CrmLeadInteraction> CrmLeadInteractions { get; set; } = new List<CrmLeadInteraction>();

    public virtual ICollection<CrmLeadQualification> CrmLeadQualificationCrmleadQualCreatedByNavigations { get; set; } = new List<CrmLeadQualification>();

    public virtual ICollection<CrmLeadQualification> CrmLeadQualificationCrmleadQualQualifiedByNavigations { get; set; } = new List<CrmLeadQualification>();

    public virtual ICollection<CrmLeadStatusHistory> CrmLeadStatusHistories { get; set; } = new List<CrmLeadStatusHistory>();

    public virtual ICollection<CrmMarketFeedbackItem> CrmMarketFeedbackItems { get; set; } = new List<CrmMarketFeedbackItem>();

    public virtual ICollection<CrmMessageVariationHistory> CrmMessageVariationHistories { get; set; } = new List<CrmMessageVariationHistory>();

    public virtual ICollection<CrmNextBestAction> CrmNextBestActionCrmnbaAssignedUsers { get; set; } = new List<CrmNextBestAction>();

    public virtual ICollection<CrmNextBestAction> CrmNextBestActionCrmnbaDecidedByNavigations { get; set; } = new List<CrmNextBestAction>();

    public virtual ICollection<CrmNote> CrmNoteCrmnoteCreatedByNavigations { get; set; } = new List<CrmNote>();

    public virtual ICollection<CrmNote> CrmNoteCrmnoteUpdatedByNavigations { get; set; } = new List<CrmNote>();

    public virtual ICollection<CrmOnboardingRun> CrmOnboardingRunCrmonboardRunCreatedByNavigations { get; set; } = new List<CrmOnboardingRun>();

    public virtual ICollection<CrmOnboardingRun> CrmOnboardingRunCrmonboardRunOwnerUsers { get; set; } = new List<CrmOnboardingRun>();

    public virtual ICollection<CrmOnboardingTask> CrmOnboardingTaskCrmonboardTaskAssignedUsers { get; set; } = new List<CrmOnboardingTask>();

    public virtual ICollection<CrmOnboardingTask> CrmOnboardingTaskCrmonboardTaskCompletedByNavigations { get; set; } = new List<CrmOnboardingTask>();

    public virtual ICollection<CrmOpportunityCompetitor> CrmOpportunityCompetitors { get; set; } = new List<CrmOpportunityCompetitor>();

    public virtual ICollection<CrmOpportunity> CrmOpportunityCrmopptyCreatedByNavigations { get; set; } = new List<CrmOpportunity>();

    public virtual ICollection<CrmOpportunity> CrmOpportunityCrmopptyOwnerUsers { get; set; } = new List<CrmOpportunity>();

    public virtual ICollection<CrmOpportunity> CrmOpportunityCrmopptyUpdatedByNavigations { get; set; } = new List<CrmOpportunity>();

    public virtual ICollection<CrmOpportunityJobLink> CrmOpportunityJobLinks { get; set; } = new List<CrmOpportunityJobLink>();

    public virtual ICollection<CrmOpportunityQuoteLink> CrmOpportunityQuoteLinks { get; set; } = new List<CrmOpportunityQuoteLink>();

    public virtual ICollection<CrmOpportunityStageHistory> CrmOpportunityStageHistories { get; set; } = new List<CrmOpportunityStageHistory>();

    public virtual ICollection<CrmOpportunityStakeholder> CrmOpportunityStakeholders { get; set; } = new List<CrmOpportunityStakeholder>();

    public virtual ICollection<CrmOrgLifecycleTag> CrmOrgLifecycleTags { get; set; } = new List<CrmOrgLifecycleTag>();

    public virtual ICollection<CrmPersonalMessageDraft> CrmPersonalMessageDraftCrmpmsgAssignedUsers { get; set; } = new List<CrmPersonalMessageDraft>();

    public virtual ICollection<CrmPersonalMessageDraft> CrmPersonalMessageDraftCrmpmsgCreatedByNavigations { get; set; } = new List<CrmPersonalMessageDraft>();

    public virtual ICollection<CrmPersonalMessageDraft> CrmPersonalMessageDraftCrmpmsgDecidedByNavigations { get; set; } = new List<CrmPersonalMessageDraft>();

    public virtual ICollection<CrmPersonalMessageDraft> CrmPersonalMessageDraftCrmpmsgUpdatedByNavigations { get; set; } = new List<CrmPersonalMessageDraft>();

    public virtual ICollection<CrmPersonalisationProfile> CrmPersonalisationProfileCrmpersProfileCreatedByNavigations { get; set; } = new List<CrmPersonalisationProfile>();

    public virtual ICollection<CrmPersonalisationProfile> CrmPersonalisationProfileCrmpersProfileUsers { get; set; } = new List<CrmPersonalisationProfile>();

    public virtual ICollection<CrmQuickTask> CrmQuickTaskCrmquickTaskAssignedUsers { get; set; } = new List<CrmQuickTask>();

    public virtual ICollection<CrmQuickTask> CrmQuickTaskCrmquickTaskCompletedByNavigations { get; set; } = new List<CrmQuickTask>();

    public virtual ICollection<CrmQuickTask> CrmQuickTaskCrmquickTaskCreatedByNavigations { get; set; } = new List<CrmQuickTask>();

    public virtual ICollection<CrmQuickTask> CrmQuickTaskCrmquickTaskUpdatedByNavigations { get; set; } = new List<CrmQuickTask>();

    public virtual ICollection<CrmQuickTaskDecision> CrmQuickTaskDecisions { get; set; } = new List<CrmQuickTaskDecision>();

    public virtual ICollection<CrmQuickTaskOption> CrmQuickTaskOptions { get; set; } = new List<CrmQuickTaskOption>();

    public virtual ICollection<CrmQuoteFollowupAiinsight> CrmQuoteFollowupAiinsights { get; set; } = new List<CrmQuoteFollowupAiinsight>();

    public virtual ICollection<CrmQuoteFollowupAttempt> CrmQuoteFollowupAttempts { get; set; } = new List<CrmQuoteFollowupAttempt>();

    public virtual ICollection<CrmQuoteFollowup> CrmQuoteFollowupCrmqfCreatedByNavigations { get; set; } = new List<CrmQuoteFollowup>();

    public virtual ICollection<CrmQuoteFollowup> CrmQuoteFollowupCrmqfOwnerUsers { get; set; } = new List<CrmQuoteFollowup>();

    public virtual ICollection<CrmQuoteFollowup> CrmQuoteFollowupCrmqfUpdatedByNavigations { get; set; } = new List<CrmQuoteFollowup>();

    public virtual ICollection<CrmQuoteFollowupResponse> CrmQuoteFollowupResponses { get; set; } = new List<CrmQuoteFollowupResponse>();

    public virtual ICollection<CrmQuoteLostDetail> CrmQuoteLostDetails { get; set; } = new List<CrmQuoteLostDetail>();

    public virtual ICollection<CrmRelationshipMap> CrmRelationshipMapCrmrelMapCreatedByNavigations { get; set; } = new List<CrmRelationshipMap>();

    public virtual ICollection<CrmRelationshipMap> CrmRelationshipMapCrmrelMapFromUsers { get; set; } = new List<CrmRelationshipMap>();

    public virtual ICollection<CrmRelationshipMap> CrmRelationshipMapCrmrelMapToUsers { get; set; } = new List<CrmRelationshipMap>();

    public virtual ICollection<CrmReminder> CrmReminders { get; set; } = new List<CrmReminder>();

    public virtual ICollection<CrmSalesPitchAnalysis> CrmSalesPitchAnalyses { get; set; } = new List<CrmSalesPitchAnalysis>();

    public virtual ICollection<CrmSalesPitchRecommendation> CrmSalesPitchRecommendations { get; set; } = new List<CrmSalesPitchRecommendation>();

    public virtual ICollection<CrmSalesRepKpisnapshot> CrmSalesRepKpisnapshots { get; set; } = new List<CrmSalesRepKpisnapshot>();

    public virtual ICollection<CrmSetting> CrmSettingCrmsettingsCreatedByNavigations { get; set; } = new List<CrmSetting>();

    public virtual ICollection<CrmSetting> CrmSettingCrmsettingsDefaultLeadOwnerUsers { get; set; } = new List<CrmSetting>();

    public virtual ICollection<CrmSetting> CrmSettingCrmsettingsUpdatedByNavigations { get; set; } = new List<CrmSetting>();

    public virtual ICollection<CrmTerritory> CrmTerritoryCrmterritoryCreatedByNavigations { get; set; } = new List<CrmTerritory>();

    public virtual ICollection<CrmTerritory> CrmTerritoryCrmterritoryUpdatedByNavigations { get; set; } = new List<CrmTerritory>();

    public virtual ICollection<CrmTerritoryMember> CrmTerritoryMembers { get; set; } = new List<CrmTerritoryMember>();

    public virtual ICollection<DocbAssetLibrary> DocbAssetLibraryDocbasCreatedByNavigations { get; set; } = new List<DocbAssetLibrary>();

    public virtual ICollection<DocbAssetLibrary> DocbAssetLibraryDocbasUpdatedByNavigations { get; set; } = new List<DocbAssetLibrary>();

    public virtual ICollection<DocbAssetVersion> DocbAssetVersions { get; set; } = new List<DocbAssetVersion>();

    public virtual ICollection<DocbAuditLog> DocbAuditLogs { get; set; } = new List<DocbAuditLog>();

    public virtual ICollection<DocbClauseLibrary> DocbClauseLibraryDocbclCreatedByNavigations { get; set; } = new List<DocbClauseLibrary>();

    public virtual ICollection<DocbClauseLibrary> DocbClauseLibraryDocbclUpdatedByNavigations { get; set; } = new List<DocbClauseLibrary>();

    public virtual ICollection<DocbDataSource> DocbDataSources { get; set; } = new List<DocbDataSource>();

    public virtual ICollection<DocbDocumentTemplate> DocbDocumentTemplateDocbtCreatedByNavigations { get; set; } = new List<DocbDocumentTemplate>();

    public virtual ICollection<DocbDocumentTemplate> DocbDocumentTemplateDocbtUpdatedByNavigations { get; set; } = new List<DocbDocumentTemplate>();

    public virtual ICollection<DocbGeneratedDocument> DocbGeneratedDocuments { get; set; } = new List<DocbGeneratedDocument>();

    public virtual ICollection<DocbLibraryDocument> DocbLibraryDocumentDocbldCreatedByNavigations { get; set; } = new List<DocbLibraryDocument>();

    public virtual ICollection<DocbLibraryDocument> DocbLibraryDocumentDocbldUpdatedByNavigations { get; set; } = new List<DocbLibraryDocument>();

    public virtual ICollection<DocbLibraryPack> DocbLibraryPackDocblpCreatedByNavigations { get; set; } = new List<DocbLibraryPack>();

    public virtual ICollection<DocbLibraryPack> DocbLibraryPackDocblpUpdatedByNavigations { get; set; } = new List<DocbLibraryPack>();

    public virtual ICollection<DocbLibraryPackItem> DocbLibraryPackItems { get; set; } = new List<DocbLibraryPackItem>();

    public virtual ICollection<DocbRenderJob> DocbRenderJobs { get; set; } = new List<DocbRenderJob>();

    public virtual ICollection<DocbSectionDefinition> DocbSectionDefinitionDocbsCreatedByNavigations { get; set; } = new List<DocbSectionDefinition>();

    public virtual ICollection<DocbSectionDefinition> DocbSectionDefinitionDocbsUpdatedByNavigations { get; set; } = new List<DocbSectionDefinition>();

    public virtual ICollection<DocbSectionLayoutBlock> DocbSectionLayoutBlocks { get; set; } = new List<DocbSectionLayoutBlock>();

    public virtual ICollection<DocbSectionLayoutCell> DocbSectionLayoutCells { get; set; } = new List<DocbSectionLayoutCell>();

    public virtual ICollection<DocbSectionLayoutRow> DocbSectionLayoutRows { get; set; } = new List<DocbSectionLayoutRow>();

    public virtual ICollection<DocbSectionVersion> DocbSectionVersionDocbsvCreatedByNavigations { get; set; } = new List<DocbSectionVersion>();

    public virtual ICollection<DocbSectionVersion> DocbSectionVersionDocbsvPublishedByNavigations { get; set; } = new List<DocbSectionVersion>();

    public virtual ICollection<DocbTemplatePage> DocbTemplatePages { get; set; } = new List<DocbTemplatePage>();

    public virtual ICollection<DocbTemplateQaissue> DocbTemplateQaissues { get; set; } = new List<DocbTemplateQaissue>();

    public virtual ICollection<DocbTemplateQarun> DocbTemplateQaruns { get; set; } = new List<DocbTemplateQarun>();

    public virtual ICollection<DocbTemplateVersion> DocbTemplateVersionDocbtvCreatedByNavigations { get; set; } = new List<DocbTemplateVersion>();

    public virtual ICollection<DocbTemplateVersion> DocbTemplateVersionDocbtvPublishedByNavigations { get; set; } = new List<DocbTemplateVersion>();

    public virtual ICollection<DocbTheme> DocbThemes { get; set; } = new List<DocbTheme>();

    public virtual ICollection<DocsecDocumentFingerprint> DocsecDocumentFingerprints { get; set; } = new List<DocsecDocumentFingerprint>();

    public virtual ICollection<DocsecDocumentMark> DocsecDocumentMarks { get; set; } = new List<DocsecDocumentMark>();

    public virtual ICollection<DocsecDocumentSignature> DocsecDocumentSignatures { get; set; } = new List<DocsecDocumentSignature>();

    public virtual ICollection<DocsecSecurityProfile> DocsecSecurityProfileDocsecpCreatedByNavigations { get; set; } = new List<DocsecSecurityProfile>();

    public virtual ICollection<DocsecSecurityProfile> DocsecSecurityProfileDocsecpUpdatedByNavigations { get; set; } = new List<DocsecSecurityProfile>();

    public virtual ICollection<DocsecSigningKey> DocsecSigningKeyDocseckCreatedByNavigations { get; set; } = new List<DocsecSigningKey>();

    public virtual ICollection<DocsecSigningKey> DocsecSigningKeyDocseckUpdatedByNavigations { get; set; } = new List<DocsecSigningKey>();

    public virtual ICollection<DocsecVerificationIssue> DocsecVerificationIssues { get; set; } = new List<DocsecVerificationIssue>();

    public virtual ICollection<DocsecVerificationToken> DocsecVerificationTokenDocsecvtCreatedByNavigations { get; set; } = new List<DocsecVerificationToken>();

    public virtual ICollection<DocsecVerificationToken> DocsecVerificationTokenDocsecvtRevokedByNavigations { get; set; } = new List<DocsecVerificationToken>();

    public virtual ICollection<DocsecVerificationToken> DocsecVerificationTokenDocsecvtUpdatedByNavigations { get; set; } = new List<DocsecVerificationToken>();

    public virtual ICollection<DocsigRequest> DocsigRequestDocsigreqCancelledByNavigations { get; set; } = new List<DocsigRequest>();

    public virtual ICollection<DocsigRequest> DocsigRequestDocsigreqCreatedByNavigations { get; set; } = new List<DocsigRequest>();

    public virtual ICollection<DocsigRequest> DocsigRequestDocsigreqUpdatedByNavigations { get; set; } = new List<DocsigRequest>();

    public virtual ICollection<EdiAcknowledgement> EdiAcknowledgements { get; set; } = new List<EdiAcknowledgement>();

    public virtual ICollection<EdiAiinsight> EdiAiinsights { get; set; } = new List<EdiAiinsight>();

    public virtual ICollection<EdiBatch> EdiBatches { get; set; } = new List<EdiBatch>();

    public virtual ICollection<EdiCertification> EdiCertifications { get; set; } = new List<EdiCertification>();

    public virtual ICollection<EdiConnection> EdiConnectionEdicCreatedByNavigations { get; set; } = new List<EdiConnection>();

    public virtual ICollection<EdiConnection> EdiConnectionEdicUpdatedByNavigations { get; set; } = new List<EdiConnection>();

    public virtual ICollection<EdiMappingProfile> EdiMappingProfileEdimapCreatedByNavigations { get; set; } = new List<EdiMappingProfile>();

    public virtual ICollection<EdiMappingProfile> EdiMappingProfileEdimapUpdatedByNavigations { get; set; } = new List<EdiMappingProfile>();

    public virtual ICollection<EdiMappingVersion> EdiMappingVersions { get; set; } = new List<EdiMappingVersion>();

    public virtual ICollection<EdiMessage> EdiMessageEdimessageCreatedByNavigations { get; set; } = new List<EdiMessage>();

    public virtual ICollection<EdiMessage> EdiMessageEdimessageUpdatedByNavigations { get; set; } = new List<EdiMessage>();

    public virtual ICollection<EdiMessageLink> EdiMessageLinks { get; set; } = new List<EdiMessageLink>();

    public virtual ICollection<EdiMessageProfile> EdiMessageProfiles { get; set; } = new List<EdiMessageProfile>();

    public virtual ICollection<EdiProcessingEvent> EdiProcessingEvents { get; set; } = new List<EdiProcessingEvent>();

    public virtual ICollection<EdiProcessingRun> EdiProcessingRuns { get; set; } = new List<EdiProcessingRun>();

    public virtual ICollection<EdiServiceProvider> EdiServiceProviders { get; set; } = new List<EdiServiceProvider>();

    public virtual ICollection<EdiTestCase> EdiTestCases { get; set; } = new List<EdiTestCase>();

    public virtual ICollection<EdiTestRun> EdiTestRuns { get; set; } = new List<EdiTestRun>();

    public virtual ICollection<EdiTradingPartner> EdiTradingPartnerEditpCreatedByNavigations { get; set; } = new List<EdiTradingPartner>();

    public virtual ICollection<EdiTradingPartner> EdiTradingPartnerEditpUpdatedByNavigations { get; set; } = new List<EdiTradingPartner>();

    public virtual ICollection<EdiValidationIssue> EdiValidationIssueEdiviCreatedByNavigations { get; set; } = new List<EdiValidationIssue>();

    public virtual ICollection<EdiValidationIssue> EdiValidationIssueEdiviResolvedByNavigations { get; set; } = new List<EdiValidationIssue>();

    public virtual ICollection<FinAccountingDateOverride> FinAccountingDateOverrideFinacctDateOvApprovedByNavigations { get; set; } = new List<FinAccountingDateOverride>();

    public virtual ICollection<FinAccountingDateOverride> FinAccountingDateOverrideFinacctDateOvCreatedByNavigations { get; set; } = new List<FinAccountingDateOverride>();

    public virtual ICollection<FinAccountingDateRule> FinAccountingDateRules { get; set; } = new List<FinAccountingDateRule>();

    public virtual ICollection<FinAccrual> FinAccruals { get; set; } = new List<FinAccrual>();

    public virtual ICollection<FinAiinsightAction> FinAiinsightActionFinaiactAssignedUsers { get; set; } = new List<FinAiinsightAction>();

    public virtual ICollection<FinAiinsightAction> FinAiinsightActionFinaiactCompletedByNavigations { get; set; } = new List<FinAiinsightAction>();

    public virtual ICollection<FinAiinsight> FinAiinsightFinaiinsightActionedByNavigations { get; set; } = new List<FinAiinsight>();

    public virtual ICollection<FinAiinsight> FinAiinsightFinaiinsightCreatedByNavigations { get; set; } = new List<FinAiinsight>();

    public virtual ICollection<FinAiinsight> FinAiinsightFinaiinsightDismissedByNavigations { get; set; } = new List<FinAiinsight>();

    public virtual ICollection<FinAiinsightRule> FinAiinsightRules { get; set; } = new List<FinAiinsightRule>();

    public virtual ICollection<FinAuthorisationDecision> FinAuthorisationDecisionFinauthdecDecidedByNavigations { get; set; } = new List<FinAuthorisationDecision>();

    public virtual ICollection<FinAuthorisationDecision> FinAuthorisationDecisionFinauthdecDelegatedToUsers { get; set; } = new List<FinAuthorisationDecision>();

    public virtual ICollection<FinAuthorisationRequest> FinAuthorisationRequests { get; set; } = new List<FinAuthorisationRequest>();

    public virtual ICollection<FinAuthorityRule> FinAuthorityRuleFinauthCreatedByNavigations { get; set; } = new List<FinAuthorityRule>();

    public virtual ICollection<FinAuthorityRule> FinAuthorityRuleFinauthRequiredApproverUsers { get; set; } = new List<FinAuthorityRule>();

    public virtual ICollection<FinBankMatch> FinBankMatches { get; set; } = new List<FinBankMatch>();

    public virtual ICollection<FinCashAllocation> FinCashAllocations { get; set; } = new List<FinCashAllocation>();

    public virtual ICollection<FinCashTransaction> FinCashTransactions { get; set; } = new List<FinCashTransaction>();

    public virtual ICollection<FinChargeRoeapplication> FinChargeRoeapplications { get; set; } = new List<FinChargeRoeapplication>();

    public virtual ICollection<FinCommissionAdjustment> FinCommissionAdjustments { get; set; } = new List<FinCommissionAdjustment>();

    public virtual ICollection<FinCommissionItem> FinCommissionItems { get; set; } = new List<FinCommissionItem>();

    public virtual ICollection<FinCommissionRun> FinCommissionRuns { get; set; } = new List<FinCommissionRun>();

    public virtual ICollection<FinCommissionScheme> FinCommissionSchemes { get; set; } = new List<FinCommissionScheme>();

    public virtual ICollection<FinCreditHold> FinCreditHoldFinholdPlacedByNavigations { get; set; } = new List<FinCreditHold>();

    public virtual ICollection<FinCreditHold> FinCreditHoldFinholdReleasedByNavigations { get; set; } = new List<FinCreditHold>();

    public virtual ICollection<FinCreditNoteApproval> FinCreditNoteApprovals { get; set; } = new List<FinCreditNoteApproval>();

    public virtual ICollection<FinCreditNoteRequest> FinCreditNoteRequests { get; set; } = new List<FinCreditNoteRequest>();

    public virtual ICollection<FinCreditProfile> FinCreditProfiles { get; set; } = new List<FinCreditProfile>();

    public virtual ICollection<FinCreditStopRecommendation> FinCreditStopRecommendations { get; set; } = new List<FinCreditStopRecommendation>();

    public virtual ICollection<FinCutoffRun> FinCutoffRuns { get; set; } = new List<FinCutoffRun>();

    public virtual ICollection<FinDebtAction> FinDebtActions { get; set; } = new List<FinDebtAction>();

    public virtual ICollection<FinDebtCase> FinDebtCases { get; set; } = new List<FinDebtCase>();

    public virtual ICollection<FinDocumentApproval> FinDocumentApprovalFindocApprApprovedByNavigations { get; set; } = new List<FinDocumentApproval>();

    public virtual ICollection<FinDocumentApproval> FinDocumentApprovalFindocApprRequestedByNavigations { get; set; } = new List<FinDocumentApproval>();

    public virtual ICollection<FinDocumentDispute> FinDocumentDisputeFindocDispOpenedByNavigations { get; set; } = new List<FinDocumentDispute>();

    public virtual ICollection<FinDocumentDispute> FinDocumentDisputeFindocDispResolvedByNavigations { get; set; } = new List<FinDocumentDispute>();

    public virtual ICollection<FinDocumentFile> FinDocumentFiles { get; set; } = new List<FinDocumentFile>();

    public virtual ICollection<FinDocument> FinDocumentFindocCreatedByNavigations { get; set; } = new List<FinDocument>();

    public virtual ICollection<FinDocument> FinDocumentFindocPostedByNavigations { get; set; } = new List<FinDocument>();

    public virtual ICollection<FinDocument> FinDocumentFindocUpdatedByNavigations { get; set; } = new List<FinDocument>();

    public virtual ICollection<FinDocumentStatusHistory> FinDocumentStatusHistories { get; set; } = new List<FinDocumentStatusHistory>();

    public virtual ICollection<FinDunningRun> FinDunningRuns { get; set; } = new List<FinDunningRun>();

    public virtual ICollection<FinExchangeRateImport> FinExchangeRateImports { get; set; } = new List<FinExchangeRateImport>();

    public virtual ICollection<FinExchangeRateProvider> FinExchangeRateProviders { get; set; } = new List<FinExchangeRateProvider>();

    public virtual ICollection<FinExchangeRate> FinExchangeRates { get; set; } = new List<FinExchangeRate>();

    public virtual ICollection<FinIntegrationQueue> FinIntegrationQueues { get; set; } = new List<FinIntegrationQueue>();

    public virtual ICollection<FinJobChargeAllocation> FinJobChargeAllocations { get; set; } = new List<FinJobChargeAllocation>();

    public virtual ICollection<FinJobFinanceException> FinJobFinanceExceptions { get; set; } = new List<FinJobFinanceException>();

    public virtual ICollection<FinJobFinanceLock> FinJobFinanceLockFinjobLockLockedByNavigations { get; set; } = new List<FinJobFinanceLock>();

    public virtual ICollection<FinJobFinanceLock> FinJobFinanceLockFinjobLockReleasedByNavigations { get; set; } = new List<FinJobFinanceLock>();

    public virtual ICollection<FinJobProfitSnapshot> FinJobProfitSnapshots { get; set; } = new List<FinJobProfitSnapshot>();

    public virtual ICollection<FinJobRoeset> FinJobRoesetFinjobRoeApprovedByNavigations { get; set; } = new List<FinJobRoeset>();

    public virtual ICollection<FinJobRoeset> FinJobRoesetFinjobRoeCreatedByNavigations { get; set; } = new List<FinJobRoeset>();

    public virtual ICollection<FinKpirecommendation> FinKpirecommendations { get; set; } = new List<FinKpirecommendation>();

    public virtual ICollection<FinOperatingModelSetting> FinOperatingModelSettings { get; set; } = new List<FinOperatingModelSetting>();

    public virtual ICollection<FinPaymentRun> FinPaymentRunFinpayRunApprovedByNavigations { get; set; } = new List<FinPaymentRun>();

    public virtual ICollection<FinPaymentRun> FinPaymentRunFinpayRunCreatedByNavigations { get; set; } = new List<FinPaymentRun>();

    public virtual ICollection<FinPeriodAdjustment> FinPeriodAdjustments { get; set; } = new List<FinPeriodAdjustment>();

    public virtual ICollection<FinPeriodCloseRun> FinPeriodCloseRunFincloseRunApprovedByNavigations { get; set; } = new List<FinPeriodCloseRun>();

    public virtual ICollection<FinPeriodCloseRun> FinPeriodCloseRunFincloseRunStartedByNavigations { get; set; } = new List<FinPeriodCloseRun>();

    public virtual ICollection<FinPeriod> FinPeriodFinperiodCreatedByNavigations { get; set; } = new List<FinPeriod>();

    public virtual ICollection<FinPeriod> FinPeriodFinperiodLockedByNavigations { get; set; } = new List<FinPeriod>();

    public virtual ICollection<FinPeriod> FinPeriodFinperiodSoftClosedByNavigations { get; set; } = new List<FinPeriod>();

    public virtual ICollection<FinPeriodLock> FinPeriodLocks { get; set; } = new List<FinPeriodLock>();

    public virtual ICollection<FinPostingBatch> FinPostingBatchFinpostBatchCreatedByNavigations { get; set; } = new List<FinPostingBatch>();

    public virtual ICollection<FinPostingBatch> FinPostingBatchFinpostBatchPostedByNavigations { get; set; } = new List<FinPostingBatch>();

    public virtual ICollection<FinProfitShareRun> FinProfitShareRuns { get; set; } = new List<FinProfitShareRun>();

    public virtual ICollection<FinProfitShareSettlement> FinProfitShareSettlements { get; set; } = new List<FinProfitShareSettlement>();

    public virtual ICollection<FinRevaluationRun> FinRevaluationRuns { get; set; } = new List<FinRevaluationRun>();

    public virtual ICollection<FinRoeoverride> FinRoeoverrideFinroeovApprovedByNavigations { get; set; } = new List<FinRoeoverride>();

    public virtual ICollection<FinRoeoverride> FinRoeoverrideFinroeovCreatedByNavigations { get; set; } = new List<FinRoeoverride>();

    public virtual ICollection<FinSetting> FinSettingFinsetCreatedByNavigations { get; set; } = new List<FinSetting>();

    public virtual ICollection<FinSetting> FinSettingFinsetUpdatedByNavigations { get; set; } = new List<FinSetting>();

    public virtual ICollection<FinStatementImport> FinStatementImports { get; set; } = new List<FinStatementImport>();

    public virtual ICollection<FinTaxReturn> FinTaxReturns { get; set; } = new List<FinTaxReturn>();

    public virtual ICollection<FinTaxSubmissionEvent> FinTaxSubmissionEvents { get; set; } = new List<FinTaxSubmissionEvent>();

    public virtual ICollection<FinVarianceApproval> FinVarianceApprovals { get; set; } = new List<FinVarianceApproval>();

    public virtual ICollection<FinVarianceCase> FinVarianceCases { get; set; } = new List<FinVarianceCase>();

    public virtual ICollection<FinVesselRoeset> FinVesselRoesetFinvesselRoeApprovedByNavigations { get; set; } = new List<FinVesselRoeset>();

    public virtual ICollection<FinVesselRoeset> FinVesselRoesetFinvesselRoeCreatedByNavigations { get; set; } = new List<FinVesselRoeset>();

    public virtual ICollection<FinWipitem> FinWipitems { get; set; } = new List<FinWipitem>();

    public virtual ICollection<LocLocalisationProfile> LocLocalisationProfileLocprofileCreatedByNavigations { get; set; } = new List<LocLocalisationProfile>();

    public virtual ICollection<LocLocalisationProfile> LocLocalisationProfileLocprofileUpdatedByNavigations { get; set; } = new List<LocLocalisationProfile>();

    public virtual ICollection<LocProfileScope> LocProfileScopeLocprofileScopeCreatedByNavigations { get; set; } = new List<LocProfileScope>();

    public virtual ICollection<LocProfileScope> LocProfileScopeLocprofileScopeUsers { get; set; } = new List<LocProfileScope>();

    public virtual ICollection<LocRecordDateTimeContext> LocRecordDateTimeContexts { get; set; } = new List<LocRecordDateTimeContext>();

    public virtual LocUserPreference? LocUserPreference { get; set; }

    public virtual ICollection<MdxConflictCase> MdxConflictCaseMdxconflictAssignedUsers { get; set; } = new List<MdxConflictCase>();

    public virtual ICollection<MdxConflictCase> MdxConflictCaseMdxconflictResolvedByNavigations { get; set; } = new List<MdxConflictCase>();

    public virtual ICollection<MdxDataChangeEvent> MdxDataChangeEvents { get; set; } = new List<MdxDataChangeEvent>();

    public virtual ICollection<MdxInboundReviewItem> MdxInboundReviewItemMdxreviewAssignedUsers { get; set; } = new List<MdxInboundReviewItem>();

    public virtual ICollection<MdxInboundReviewItem> MdxInboundReviewItemMdxreviewReviewedByNavigations { get; set; } = new List<MdxInboundReviewItem>();

    public virtual ICollection<MdxShareAgreement> MdxShareAgreementMdxagreementApprovedByNavigations { get; set; } = new List<MdxShareAgreement>();

    public virtual ICollection<MdxShareAgreement> MdxShareAgreementMdxagreementCreatedByNavigations { get; set; } = new List<MdxShareAgreement>();

    public virtual ICollection<MdxShareAgreement> MdxShareAgreementMdxagreementUpdatedByNavigations { get; set; } = new List<MdxShareAgreement>();

    public virtual ICollection<MdxSharedJob> MdxSharedJobMdxsharedJobCreatedByNavigations { get; set; } = new List<MdxSharedJob>();

    public virtual ICollection<MdxSharedJob> MdxSharedJobMdxsharedJobUpdatedByNavigations { get; set; } = new List<MdxSharedJob>();

    public virtual ICollection<MdxSharedJobVersion> MdxSharedJobVersions { get; set; } = new List<MdxSharedJobVersion>();

    public virtual ICollection<MigCodeMapping> MigCodeMappings { get; set; } = new List<MigCodeMapping>();

    public virtual ICollection<MigImportBatch> MigImportBatches { get; set; } = new List<MigImportBatch>();

    public virtual ICollection<MigImportRun> MigImportRuns { get; set; } = new List<MigImportRun>();

    public virtual ICollection<MigProject> MigProjects { get; set; } = new List<MigProject>();

    public virtual ICollection<MigRollbackPlan> MigRollbackPlans { get; set; } = new List<MigRollbackPlan>();

    public virtual ICollection<MigValidationIssue> MigValidationIssues { get; set; } = new List<MigValidationIssue>();

    public virtual ICollection<ObsAiactionLog> ObsAiactionLogs { get; set; } = new List<ObsAiactionLog>();

    public virtual ICollection<ObsApirequest> ObsApirequests { get; set; } = new List<ObsApirequest>();

    public virtual ICollection<ObsExceptionQueue> ObsExceptionQueues { get; set; } = new List<ObsExceptionQueue>();

    public virtual ICollection<ObsIntegrationEvent> ObsIntegrationEvents { get; set; } = new List<ObsIntegrationEvent>();

    public virtual ICollection<PortalActionRequest> PortalActionRequestPortalActionCreatedByNavigations { get; set; } = new List<PortalActionRequest>();

    public virtual ICollection<PortalActionRequest> PortalActionRequestPortalActionUpdatedByNavigations { get; set; } = new List<PortalActionRequest>();

    public virtual ICollection<PortalActionResponse> PortalActionResponsePortalResponseAppliedByNavigations { get; set; } = new List<PortalActionResponse>();

    public virtual ICollection<PortalActionResponse> PortalActionResponsePortalResponseInternalReviewedByNavigations { get; set; } = new List<PortalActionResponse>();

    public virtual ICollection<PortalApiaccessToken> PortalApiaccessTokenPortalApitokenCreatedByNavigations { get; set; } = new List<PortalApiaccessToken>();

    public virtual ICollection<PortalApiaccessToken> PortalApiaccessTokenPortalApitokenRevokedByNavigations { get; set; } = new List<PortalApiaccessToken>();

    public virtual ICollection<PortalApiclient> PortalApiclientPortalApiclientCreatedByNavigations { get; set; } = new List<PortalApiclient>();

    public virtual ICollection<PortalApiclient> PortalApiclientPortalApiclientUpdatedByNavigations { get; set; } = new List<PortalApiclient>();

    public virtual ICollection<PortalDocumentShare> PortalDocumentShares { get; set; } = new List<PortalDocumentShare>();

    public virtual ICollection<PortalFileUpload> PortalFileUploadPortalUploadRequestedByNavigations { get; set; } = new List<PortalFileUpload>();

    public virtual ICollection<PortalFileUpload> PortalFileUploadPortalUploadReviewedByNavigations { get; set; } = new List<PortalFileUpload>();

    public virtual ICollection<PortalInvitation> PortalInvitations { get; set; } = new List<PortalInvitation>();

    public virtual ICollection<PortalNotificationSubscription> PortalNotificationSubscriptions { get; set; } = new List<PortalNotificationSubscription>();

    public virtual ICollection<PortalPublicLink> PortalPublicLinkPortalLinkCreatedByNavigations { get; set; } = new List<PortalPublicLink>();

    public virtual ICollection<PortalPublicLink> PortalPublicLinkPortalLinkRevokedByNavigations { get; set; } = new List<PortalPublicLink>();

    public virtual ICollection<PortalRecordShare> PortalRecordSharePortalShareCreatedByNavigations { get; set; } = new List<PortalRecordShare>();

    public virtual ICollection<PortalRecordShare> PortalRecordSharePortalShareRevokedByNavigations { get; set; } = new List<PortalRecordShare>();

    public virtual ICollection<PortalRole> PortalRoles { get; set; } = new List<PortalRole>();

    public virtual ICollection<PortalSite> PortalSitePortalSiteCreatedByNavigations { get; set; } = new List<PortalSite>();

    public virtual ICollection<PortalSite> PortalSitePortalSiteUpdatedByNavigations { get; set; } = new List<PortalSite>();

    public virtual ICollection<PortalThreadAccess> PortalThreadAccesses { get; set; } = new List<PortalThreadAccess>();

    public virtual ICollection<PortalUserOrganisation> PortalUserOrganisations { get; set; } = new List<PortalUserOrganisation>();

    public virtual ICollection<PortalUser> PortalUserPortalUserCreatedByNavigations { get; set; } = new List<PortalUser>();

    public virtual ICollection<PortalUser> PortalUserPortalUserUpdatedByNavigations { get; set; } = new List<PortalUser>();

    public virtual ICollection<PortalUserRole> PortalUserRoles { get; set; } = new List<PortalUserRole>();

    public virtual ICollection<RateAuditEvent> RateAuditEvents { get; set; } = new List<RateAuditEvent>();

    public virtual ICollection<RateChargeCode> RateChargeCodeRatechargeCreatedByNavigations { get; set; } = new List<RateChargeCode>();

    public virtual ICollection<RateChargeCode> RateChargeCodeRatechargeUpdatedByNavigations { get; set; } = new List<RateChargeCode>();

    public virtual ICollection<RateContract> RateContractRatecontractCreatedByNavigations { get; set; } = new List<RateContract>();

    public virtual ICollection<RateContract> RateContractRatecontractOwnerUsers { get; set; } = new List<RateContract>();

    public virtual ICollection<RateContract> RateContractRatecontractUpdatedByNavigations { get; set; } = new List<RateContract>();

    public virtual ICollection<RateContractVersion> RateContractVersionRatecontractVerCreatedByNavigations { get; set; } = new List<RateContractVersion>();

    public virtual ICollection<RateContractVersion> RateContractVersionRatecontractVerPublishedByNavigations { get; set; } = new List<RateContractVersion>();

    public virtual ICollection<RateContractVersion> RateContractVersionRatecontractVerUpdatedByNavigations { get; set; } = new List<RateContractVersion>();

    public virtual ICollection<RateImportBatch> RateImportBatches { get; set; } = new List<RateImportBatch>();

    public virtual ICollection<RateJobCostingLink> RateJobCostingLinks { get; set; } = new List<RateJobCostingLink>();

    public virtual ICollection<RateLane> RateLanes { get; set; } = new List<RateLane>();

    public virtual ICollection<RateMarginProfile> RateMarginProfiles { get; set; } = new List<RateMarginProfile>();

    public virtual ICollection<RateQuoteLink> RateQuoteLinks { get; set; } = new List<RateQuoteLink>();

    public virtual ICollection<RateRateLine> RateRateLineRatelineCreatedByNavigations { get; set; } = new List<RateRateLine>();

    public virtual ICollection<RateRateLine> RateRateLineRatelineUpdatedByNavigations { get; set; } = new List<RateRateLine>();

    public virtual ICollection<RateRateRequest> RateRateRequestRaterequestCreatedByNavigations { get; set; } = new List<RateRateRequest>();

    public virtual ICollection<RateRateRequest> RateRateRequestRaterequestUpdatedByNavigations { get; set; } = new List<RateRateRequest>();

    public virtual ICollection<RateRateResult> RateRateResultRateresultCreatedByNavigations { get; set; } = new List<RateRateResult>();

    public virtual ICollection<RateRateResult> RateRateResultRateresultSelectedByNavigations { get; set; } = new List<RateRateResult>();

    public virtual ICollection<RateRateSheet> RateRateSheetRatesheetCreatedByNavigations { get; set; } = new List<RateRateSheet>();

    public virtual ICollection<RateRateSheet> RateRateSheetRatesheetUpdatedByNavigations { get; set; } = new List<RateRateSheet>();

    public virtual ICollection<RateResultAdjustment> RateResultAdjustments { get; set; } = new List<RateResultAdjustment>();

    public virtual ICollection<RateRuleSet> RateRuleSets { get; set; } = new List<RateRuleSet>();

    public virtual ICollection<RateServiceProduct> RateServiceProducts { get; set; } = new List<RateServiceProduct>();

    public virtual ICollection<RateSpotQuote> RateSpotQuotes { get; set; } = new List<RateSpotQuote>();

    public virtual ICollection<RateSurcharge> RateSurcharges { get; set; } = new List<RateSurcharge>();

    public virtual ICollection<RateTariffAssignment> RateTariffAssignments { get; set; } = new List<RateTariffAssignment>();

    public virtual ICollection<RateZoneGroup> RateZoneGroups { get; set; } = new List<RateZoneGroup>();

    public virtual ICollection<RptDataExport> RptDataExports { get; set; } = new List<RptDataExport>();

    public virtual ICollection<RptReportRun> RptReportRuns { get; set; } = new List<RptReportRun>();

    public virtual ICollection<RptSavedFilter> RptSavedFilters { get; set; } = new List<RptSavedFilter>();

    public virtual ICollection<RptUserSubscription> RptUserSubscriptions { get; set; } = new List<RptUserSubscription>();

    public virtual ICollection<SecApiclient> SecApiclientSecapiClientCreatedByNavigations { get; set; } = new List<SecApiclient>();

    public virtual ICollection<SecApiclient> SecApiclientSecapiClientOwnerUsers { get; set; } = new List<SecApiclient>();

    public virtual ICollection<SecApitokenHash> SecApitokenHashes { get; set; } = new List<SecApitokenHash>();

    public virtual ICollection<SecAuthIdentityLink> SecAuthIdentityLinkSecauthLinkCreatedByNavigations { get; set; } = new List<SecAuthIdentityLink>();

    public virtual ICollection<SecAuthIdentityLink> SecAuthIdentityLinkSecauthLinkUsers { get; set; } = new List<SecAuthIdentityLink>();

    public virtual ICollection<SecCredentialGrant> SecCredentialGrantSeccredGrantCreatedByNavigations { get; set; } = new List<SecCredentialGrant>();

    public virtual ICollection<SecCredentialGrant> SecCredentialGrantSeccredGrantUsers { get; set; } = new List<SecCredentialGrant>();

    public virtual ICollection<SecCredentialReference> SecCredentialReferenceSeccredCreatedByNavigations { get; set; } = new List<SecCredentialReference>();

    public virtual ICollection<SecCredentialReference> SecCredentialReferenceSeccredOwnerUsers { get; set; } = new List<SecCredentialReference>();

    public virtual ICollection<SecCredentialRotationEvent> SecCredentialRotationEvents { get; set; } = new List<SecCredentialRotationEvent>();

    public virtual ICollection<SecRecordAccessOverride> SecRecordAccessOverrideSecrecordAccessCreatedByNavigations { get; set; } = new List<SecRecordAccessOverride>();

    public virtual ICollection<SecRecordAccessOverride> SecRecordAccessOverrideSecrecordAccessUsers { get; set; } = new List<SecRecordAccessOverride>();

    public virtual ICollection<SecRolePermission> SecRolePermissions { get; set; } = new List<SecRolePermission>();

    public virtual ICollection<SecRole> SecRoles { get; set; } = new List<SecRole>();

    public virtual ICollection<SecSupportAccessSession> SecSupportAccessSessionSecsupportApprovedByNavigations { get; set; } = new List<SecSupportAccessSession>();

    public virtual ICollection<SecSupportAccessSession> SecSupportAccessSessionSecsupportRequestedByNavigations { get; set; } = new List<SecSupportAccessSession>();

    public virtual ICollection<SecUserOfficeAccess> SecUserOfficeAccessSecuserOfficeCreatedByNavigations { get; set; } = new List<SecUserOfficeAccess>();

    public virtual ICollection<SecUserOfficeAccess> SecUserOfficeAccessSecuserOfficeUsers { get; set; } = new List<SecUserOfficeAccess>();

    public virtual ICollection<SecUserRole> SecUserRoleSecuserRoleCreatedByNavigations { get; set; } = new List<SecUserRole>();

    public virtual ICollection<SecUserRole> SecUserRoleSecuserRoleUsers { get; set; } = new List<SecUserRole>();

    public virtual ICollection<SubAdminNotice> SubAdminNotices { get; set; } = new List<SubAdminNotice>();

    public virtual ICollection<SubFeatureFlagRule> SubFeatureFlagRules { get; set; } = new List<SubFeatureFlagRule>();

    public virtual ICollection<TceAiinsight> TceAiinsights { get; set; } = new List<TceAiinsight>();

    public virtual ICollection<TceAuditEvent> TceAuditEvents { get; set; } = new List<TceAuditEvent>();

    public virtual ICollection<TceCaseDecision> TceCaseDecisions { get; set; } = new List<TceCaseDecision>();

    public virtual ICollection<TceComplianceCase> TceComplianceCaseTcecaseAssignedUsers { get; set; } = new List<TceComplianceCase>();

    public virtual ICollection<TceComplianceCase> TceComplianceCaseTcecaseClosedByNavigations { get; set; } = new List<TceComplianceCase>();

    public virtual ICollection<TceComplianceCase> TceComplianceCaseTcecaseCreatedByNavigations { get; set; } = new List<TceComplianceCase>();

    public virtual ICollection<TceComplianceCase> TceComplianceCaseTcecaseUpdatedByNavigations { get; set; } = new List<TceComplianceCase>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItemTcecheckItemAssignedUsers { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItemTcecheckItemCompletedByNavigations { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItemTcecheckItemCreatedByNavigations { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItemTcecheckItemUpdatedByNavigations { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceComplianceChecklist> TceComplianceChecklistTcechecklistCreatedByNavigations { get; set; } = new List<TceComplianceChecklist>();

    public virtual ICollection<TceComplianceChecklist> TceComplianceChecklistTcechecklistUpdatedByNavigations { get; set; } = new List<TceComplianceChecklist>();

    public virtual ICollection<TceComplianceHold> TceComplianceHoldTceholdHeldByNavigations { get; set; } = new List<TceComplianceHold>();

    public virtual ICollection<TceComplianceHold> TceComplianceHoldTceholdReleasedByNavigations { get; set; } = new List<TceComplianceHold>();

    public virtual ICollection<TceCountryControlRule> TceCountryControlRules { get; set; } = new List<TceCountryControlRule>();

    public virtual ICollection<TceDataSource> TceDataSourceTcesourceCreatedByNavigations { get; set; } = new List<TceDataSource>();

    public virtual ICollection<TceDataSource> TceDataSourceTcesourceUpdatedByNavigations { get; set; } = new List<TceDataSource>();

    public virtual ICollection<TceHsclassification> TceHsclassificationTceclassCreatedByNavigations { get; set; } = new List<TceHsclassification>();

    public virtual ICollection<TceHsclassification> TceHsclassificationTceclassReviewedByNavigations { get; set; } = new List<TceHsclassification>();

    public virtual ICollection<TceIntegrationEvent> TceIntegrationEvents { get; set; } = new List<TceIntegrationEvent>();

    public virtual ICollection<TceInternalWatchlist> TceInternalWatchlists { get; set; } = new List<TceInternalWatchlist>();

    public virtual ICollection<TceLicense> TceLicenseTcelicenseCreatedByNavigations { get; set; } = new List<TceLicense>();

    public virtual ICollection<TceLicense> TceLicenseTcelicenseUpdatedByNavigations { get; set; } = new List<TceLicense>();

    public virtual ICollection<TceLicenseUsage> TceLicenseUsages { get; set; } = new List<TceLicenseUsage>();

    public virtual ICollection<TceOriginDeclaration> TceOriginDeclarationTceoriginCreatedByNavigations { get; set; } = new List<TceOriginDeclaration>();

    public virtual ICollection<TceOriginDeclaration> TceOriginDeclarationTceoriginReviewedByNavigations { get; set; } = new List<TceOriginDeclaration>();

    public virtual ICollection<TceOwnershipCheck> TceOwnershipChecks { get; set; } = new List<TceOwnershipCheck>();

    public virtual ICollection<TcePolicyScope> TcePolicyScopes { get; set; } = new List<TcePolicyScope>();

    public virtual ICollection<TcePreferenceClaim> TcePreferenceClaimTceprefCreatedByNavigations { get; set; } = new List<TcePreferenceClaim>();

    public virtual ICollection<TcePreferenceClaim> TcePreferenceClaimTceprefReviewedByNavigations { get; set; } = new List<TcePreferenceClaim>();

    public virtual ICollection<TceProductControlRule> TceProductControlRules { get; set; } = new List<TceProductControlRule>();

    public virtual ICollection<TceRecordLink> TceRecordLinks { get; set; } = new List<TceRecordLink>();

    public virtual ICollection<TceReleaseGate> TceReleaseGateTcegateClearedByNavigations { get; set; } = new List<TceReleaseGate>();

    public virtual ICollection<TceReleaseGate> TceReleaseGateTcegateCreatedByNavigations { get; set; } = new List<TceReleaseGate>();

    public virtual ICollection<TceReleaseGate> TceReleaseGateTcegateUpdatedByNavigations { get; set; } = new List<TceReleaseGate>();

    public virtual ICollection<TceScreeningMatch> TceScreeningMatchTcematchCreatedByNavigations { get; set; } = new List<TceScreeningMatch>();

    public virtual ICollection<TceScreeningMatch> TceScreeningMatchTcematchReviewByNavigations { get; set; } = new List<TceScreeningMatch>();

    public virtual ICollection<TceScreeningPolicy> TceScreeningPolicyTcepolicyCreatedByNavigations { get; set; } = new List<TceScreeningPolicy>();

    public virtual ICollection<TceScreeningPolicy> TceScreeningPolicyTcepolicyUpdatedByNavigations { get; set; } = new List<TceScreeningPolicy>();

    public virtual ICollection<TceScreeningRun> TceScreeningRunTcerunCreatedByNavigations { get; set; } = new List<TceScreeningRun>();

    public virtual ICollection<TceScreeningRun> TceScreeningRunTcerunTriggeredByNavigations { get; set; } = new List<TceScreeningRun>();

    public virtual ICollection<TceScreeningSubject> TceScreeningSubjects { get; set; } = new List<TceScreeningSubject>();

    public virtual ICollection<TceScreeningTouchpointRule> TceScreeningTouchpointRules { get; set; } = new List<TceScreeningTouchpointRule>();

    public virtual ICollection<TceWhitelist> TceWhitelistTcewhitelistApprovedByNavigations { get; set; } = new List<TceWhitelist>();

    public virtual ICollection<TceWhitelist> TceWhitelistTcewhitelistCreatedByNavigations { get; set; } = new List<TceWhitelist>();

    public virtual ICollection<WmsAdjustment> WmsAdjustmentWmsadjustCreatedByNavigations { get; set; } = new List<WmsAdjustment>();

    public virtual ICollection<WmsAdjustment> WmsAdjustmentWmsadjustPostedByNavigations { get; set; } = new List<WmsAdjustment>();

    public virtual ICollection<WmsAiinsight> WmsAiinsights { get; set; } = new List<WmsAiinsight>();

    public virtual ICollection<WmsAppointmentSlot> WmsAppointmentSlots { get; set; } = new List<WmsAppointmentSlot>();

    public virtual ICollection<WmsBillingEvent> WmsBillingEvents { get; set; } = new List<WmsBillingEvent>();

    public virtual ICollection<WmsBondedAuthorisation> WmsBondedAuthorisations { get; set; } = new List<WmsBondedAuthorisation>();

    public virtual ICollection<WmsBondedDiscrepancy> WmsBondedDiscrepancies { get; set; } = new List<WmsBondedDiscrepancy>();

    public virtual ICollection<WmsBondedEntry> WmsBondedEntries { get; set; } = new List<WmsBondedEntry>();

    public virtual ICollection<WmsBondedMovement> WmsBondedMovements { get; set; } = new List<WmsBondedMovement>();

    public virtual ICollection<WmsBondedReconciliation> WmsBondedReconciliations { get; set; } = new List<WmsBondedReconciliation>();

    public virtual ICollection<WmsBondedRemoval> WmsBondedRemovals { get; set; } = new List<WmsBondedRemoval>();

    public virtual ICollection<WmsBondedTemporaryRemoval> WmsBondedTemporaryRemovals { get; set; } = new List<WmsBondedTemporaryRemoval>();

    public virtual ICollection<WmsCustomerProfile> WmsCustomerProfiles { get; set; } = new List<WmsCustomerProfile>();

    public virtual ICollection<WmsCycleCountLine> WmsCycleCountLines { get; set; } = new List<WmsCycleCountLine>();

    public virtual ICollection<WmsCycleCountPlan> WmsCycleCountPlans { get; set; } = new List<WmsCycleCountPlan>();

    public virtual ICollection<WmsDispatch> WmsDispatches { get; set; } = new List<WmsDispatch>();

    public virtual ICollection<WmsDocument> WmsDocuments { get; set; } = new List<WmsDocument>();

    public virtual ICollection<WmsExceptionAction> WmsExceptionActions { get; set; } = new List<WmsExceptionAction>();

    public virtual ICollection<WmsException> WmsExceptionWmsexceptionRaisedByNavigations { get; set; } = new List<WmsException>();

    public virtual ICollection<WmsException> WmsExceptionWmsexceptionResolvedByNavigations { get; set; } = new List<WmsException>();

    public virtual ICollection<WmsFacilityOffice> WmsFacilityOffices { get; set; } = new List<WmsFacilityOffice>();

    public virtual ICollection<WmsFacility> WmsFacilityWmsfacilityCreatedByNavigations { get; set; } = new List<WmsFacility>();

    public virtual ICollection<WmsFacility> WmsFacilityWmsfacilityUpdatedByNavigations { get; set; } = new List<WmsFacility>();

    public virtual ICollection<WmsHandlingUnitEvent> WmsHandlingUnitEvents { get; set; } = new List<WmsHandlingUnitEvent>();

    public virtual ICollection<WmsHandlingUnit> WmsHandlingUnits { get; set; } = new List<WmsHandlingUnit>();

    public virtual ICollection<WmsInventoryAllocation> WmsInventoryAllocations { get; set; } = new List<WmsInventoryAllocation>();

    public virtual ICollection<WmsInventoryHold> WmsInventoryHoldWmsholdPlacedByNavigations { get; set; } = new List<WmsInventoryHold>();

    public virtual ICollection<WmsInventoryHold> WmsInventoryHoldWmsholdReleasedByNavigations { get; set; } = new List<WmsInventoryHold>();

    public virtual ICollection<WmsInventoryReservation> WmsInventoryReservations { get; set; } = new List<WmsInventoryReservation>();

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactions { get; set; } = new List<WmsInventoryTransaction>();

    public virtual ICollection<WmsItem> WmsItems { get; set; } = new List<WmsItem>();

    public virtual ICollection<WmsLocation> WmsLocations { get; set; } = new List<WmsLocation>();

    public virtual ICollection<WmsOrder> WmsOrderWmsorderCreatedByNavigations { get; set; } = new List<WmsOrder>();

    public virtual ICollection<WmsOrder> WmsOrderWmsorderUpdatedByNavigations { get; set; } = new List<WmsOrder>();

    public virtual ICollection<WmsPackTask> WmsPackTasks { get; set; } = new List<WmsPackTask>();

    public virtual ICollection<WmsPhotoEvidence> WmsPhotoEvidences { get; set; } = new List<WmsPhotoEvidence>();

    public virtual ICollection<WmsPickTask> WmsPickTasks { get; set; } = new List<WmsPickTask>();

    public virtual ICollection<WmsReceiptDiscrepancy> WmsReceiptDiscrepancies { get; set; } = new List<WmsReceiptDiscrepancy>();

    public virtual ICollection<WmsReceipt> WmsReceiptWmsreceiptCreatedByNavigations { get; set; } = new List<WmsReceipt>();

    public virtual ICollection<WmsReceipt> WmsReceiptWmsreceiptReceivedByNavigations { get; set; } = new List<WmsReceipt>();

    public virtual ICollection<WmsRecordLink> WmsRecordLinks { get; set; } = new List<WmsRecordLink>();

    public virtual ICollection<WmsScanEvent> WmsScanEvents { get; set; } = new List<WmsScanEvent>();

    public virtual ICollection<WmsScanSession> WmsScanSessions { get; set; } = new List<WmsScanSession>();

    public virtual ICollection<WmsServiceContract> WmsServiceContracts { get; set; } = new List<WmsServiceContract>();

    public virtual ICollection<WmsTaskAssignment> WmsTaskAssignments { get; set; } = new List<WmsTaskAssignment>();

    public virtual ICollection<WmsTaskEvent> WmsTaskEvents { get; set; } = new List<WmsTaskEvent>();

    public virtual ICollection<WmsTask> WmsTaskWmstaskCompletedByNavigations { get; set; } = new List<WmsTask>();

    public virtual ICollection<WmsTask> WmsTaskWmstaskCreatedByNavigations { get; set; } = new List<WmsTask>();

    public virtual ICollection<WmsWave> WmsWaves { get; set; } = new List<WmsWave>();

    public virtual ICollection<WmsZone> WmsZones { get; set; } = new List<WmsZone>();

    public virtual ICollection<WorkflowApprovalDecision> WorkflowApprovalDecisionWorkflowApprovalDecisionDecidedByNavigations { get; set; } = new List<WorkflowApprovalDecision>();

    public virtual ICollection<WorkflowApprovalDecision> WorkflowApprovalDecisionWorkflowApprovalDecisionDelegatedToUsers { get; set; } = new List<WorkflowApprovalDecision>();

    public virtual ICollection<WorkflowApproval> WorkflowApprovalWorkflowApprovalCreatedByNavigations { get; set; } = new List<WorkflowApproval>();

    public virtual ICollection<WorkflowApproval> WorkflowApprovalWorkflowApprovalCurrentApproverUsers { get; set; } = new List<WorkflowApproval>();

    public virtual ICollection<WorkflowApproval> WorkflowApprovalWorkflowApprovalFinalDecisionByNavigations { get; set; } = new List<WorkflowApproval>();

    public virtual ICollection<WorkflowApproval> WorkflowApprovalWorkflowApprovalRequestedByNavigations { get; set; } = new List<WorkflowApproval>();

    public virtual ICollection<WorkflowAutomationRun> WorkflowAutomationRuns { get; set; } = new List<WorkflowAutomationRun>();

    public virtual ICollection<WorkflowDefinitionVersion> WorkflowDefinitionVersionWorkflowDefVerCreatedByNavigations { get; set; } = new List<WorkflowDefinitionVersion>();

    public virtual ICollection<WorkflowDefinitionVersion> WorkflowDefinitionVersionWorkflowDefVerPublishedByNavigations { get; set; } = new List<WorkflowDefinitionVersion>();

    public virtual ICollection<WorkflowDefinitionVersion> WorkflowDefinitionVersionWorkflowDefVerUpdatedByNavigations { get; set; } = new List<WorkflowDefinitionVersion>();

    public virtual ICollection<WorkflowDefinition> WorkflowDefinitionWorkflowDefCreatedByNavigations { get; set; } = new List<WorkflowDefinition>();

    public virtual ICollection<WorkflowDefinition> WorkflowDefinitionWorkflowDefUpdatedByNavigations { get; set; } = new List<WorkflowDefinition>();

    public virtual ICollection<WorkflowEscalation> WorkflowEscalationWorkflowEscAcknowledgedByNavigations { get; set; } = new List<WorkflowEscalation>();

    public virtual ICollection<WorkflowEscalation> WorkflowEscalationWorkflowEscEscalatedByNavigations { get; set; } = new List<WorkflowEscalation>();

    public virtual ICollection<WorkflowEscalation> WorkflowEscalationWorkflowEscEscalatedToUsers { get; set; } = new List<WorkflowEscalation>();

    public virtual ICollection<WorkflowEscalation> WorkflowEscalationWorkflowEscResolvedByNavigations { get; set; } = new List<WorkflowEscalation>();

    public virtual ICollection<WorkflowEvent> WorkflowEvents { get; set; } = new List<WorkflowEvent>();

    public virtual ICollection<WorkflowExceptionLink> WorkflowExceptionLinks { get; set; } = new List<WorkflowExceptionLink>();

    public virtual ICollection<WorkflowHandoff> WorkflowHandoffWorkflowHandoffAcceptedByNavigations { get; set; } = new List<WorkflowHandoff>();

    public virtual ICollection<WorkflowHandoff> WorkflowHandoffWorkflowHandoffCreatedByNavigations { get; set; } = new List<WorkflowHandoff>();

    public virtual ICollection<WorkflowHandoff> WorkflowHandoffWorkflowHandoffFromUsers { get; set; } = new List<WorkflowHandoff>();

    public virtual ICollection<WorkflowHandoff> WorkflowHandoffWorkflowHandoffRejectedByNavigations { get; set; } = new List<WorkflowHandoff>();

    public virtual ICollection<WorkflowHandoff> WorkflowHandoffWorkflowHandoffSentByNavigations { get; set; } = new List<WorkflowHandoff>();

    public virtual ICollection<WorkflowHandoff> WorkflowHandoffWorkflowHandoffToUsers { get; set; } = new List<WorkflowHandoff>();

    public virtual ICollection<WorkflowInstanceTarget> WorkflowInstanceTargets { get; set; } = new List<WorkflowInstanceTarget>();

    public virtual ICollection<WorkflowInstance> WorkflowInstanceWorkflowInstCancelledByNavigations { get; set; } = new List<WorkflowInstance>();

    public virtual ICollection<WorkflowInstance> WorkflowInstanceWorkflowInstCreatedByNavigations { get; set; } = new List<WorkflowInstance>();

    public virtual ICollection<WorkflowInstance> WorkflowInstanceWorkflowInstUpdatedByNavigations { get; set; } = new List<WorkflowInstance>();

    public virtual ICollection<WorkflowLegacyLink> WorkflowLegacyLinks { get; set; } = new List<WorkflowLegacyLink>();

    public virtual ICollection<WorkflowSlabreach> WorkflowSlabreaches { get; set; } = new List<WorkflowSlabreach>();

    public virtual ICollection<WorkflowSlaevent> WorkflowSlaevents { get; set; } = new List<WorkflowSlaevent>();

    public virtual ICollection<WorkflowSlapause> WorkflowSlapauseWorkflowSlapauseEndedByNavigations { get; set; } = new List<WorkflowSlapause>();

    public virtual ICollection<WorkflowSlapause> WorkflowSlapauseWorkflowSlapauseStartedByNavigations { get; set; } = new List<WorkflowSlapause>();

    public virtual ICollection<WorkflowSlaprofile> WorkflowSlaprofileWorkflowSlaprofileCreatedByNavigations { get; set; } = new List<WorkflowSlaprofile>();

    public virtual ICollection<WorkflowSlaprofile> WorkflowSlaprofileWorkflowSlaprofileUpdatedByNavigations { get; set; } = new List<WorkflowSlaprofile>();

    public virtual ICollection<WorkflowSlatimer> WorkflowSlatimers { get; set; } = new List<WorkflowSlatimer>();

    public virtual ICollection<WorkflowStep> WorkflowStepWorkflowStepCreatedByNavigations { get; set; } = new List<WorkflowStep>();

    public virtual ICollection<WorkflowStep> WorkflowStepWorkflowStepDefaultAssignedUsers { get; set; } = new List<WorkflowStep>();

    public virtual ICollection<WorkflowTaskAssignment> WorkflowTaskAssignmentWorkflowTaskAssignAssignedByNavigations { get; set; } = new List<WorkflowTaskAssignment>();

    public virtual ICollection<WorkflowTaskAssignment> WorkflowTaskAssignmentWorkflowTaskAssignReleasedByNavigations { get; set; } = new List<WorkflowTaskAssignment>();

    public virtual ICollection<WorkflowTaskAssignment> WorkflowTaskAssignmentWorkflowTaskAssignUsers { get; set; } = new List<WorkflowTaskAssignment>();

    public virtual ICollection<WorkflowTaskChecklistResponse> WorkflowTaskChecklistResponses { get; set; } = new List<WorkflowTaskChecklistResponse>();

    public virtual ICollection<WorkflowTask> WorkflowTaskWorkflowTaskAssignedUsers { get; set; } = new List<WorkflowTask>();

    public virtual ICollection<WorkflowTask> WorkflowTaskWorkflowTaskCancelledByNavigations { get; set; } = new List<WorkflowTask>();

    public virtual ICollection<WorkflowTask> WorkflowTaskWorkflowTaskCompletedByNavigations { get; set; } = new List<WorkflowTask>();

    public virtual ICollection<WorkflowTask> WorkflowTaskWorkflowTaskCreatedByNavigations { get; set; } = new List<WorkflowTask>();

    public virtual ICollection<WorkflowTask> WorkflowTaskWorkflowTaskUpdatedByNavigations { get; set; } = new List<WorkflowTask>();

    public virtual ICollection<WorkflowWorkQueueMember> WorkflowWorkQueueMemberWorkflowQueueMemberCreatedByNavigations { get; set; } = new List<WorkflowWorkQueueMember>();

    public virtual ICollection<WorkflowWorkQueueMember> WorkflowWorkQueueMemberWorkflowQueueMemberUsers { get; set; } = new List<WorkflowWorkQueueMember>();

    public virtual ICollection<WorkflowWorkQueue> WorkflowWorkQueueWorkflowQueueCreatedByNavigations { get; set; } = new List<WorkflowWorkQueue>();

    public virtual ICollection<WorkflowWorkQueue> WorkflowWorkQueueWorkflowQueueManagerUsers { get; set; } = new List<WorkflowWorkQueue>();

    public virtual ICollection<WorkflowWorkQueue> WorkflowWorkQueueWorkflowQueueUpdatedByNavigations { get; set; } = new List<WorkflowWorkQueue>();

    public virtual ICollection<CmpGroup> Groups { get; set; } = new List<CmpGroup>();

    public virtual ICollection<CmpOffice> Offices { get; set; } = new List<CmpOffice>();

    public virtual ICollection<SysUserRole> SysUserRoles { get; set; } = new List<SysUserRole>();
}
