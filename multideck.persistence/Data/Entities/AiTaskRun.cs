using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiTaskRun
{
    public Guid AitrId { get; set; }

    public string AitrTaskType { get; set; } = null!;

    public string AitrStatus { get; set; } = null!;

    public Guid? AitrOrgOfficeId { get; set; }

    public Guid? AitrLegalEntityId { get; set; }

    public Guid? AitrBrandId { get; set; }

    public string? AitrTargetTable { get; set; }

    public Guid? AitrTargetId { get; set; }

    public Guid? AitrModelId { get; set; }

    public Guid? AitrPromptTemplateId { get; set; }

    public Guid? AitrTriggeredBy { get; set; }

    public string AitrTriggeredByType { get; set; } = null!;

    public string? AitrInputHash { get; set; }

    public string AitrInputJson { get; set; } = null!;

    public string AitrOutputJson { get; set; } = null!;

    public string? AitrRedactedPromptText { get; set; }

    public string? AitrRedactedResponseText { get; set; }

    public string? AitrErrorCode { get; set; }

    public string? AitrErrorMessage { get; set; }

    public int? AitrPromptTokens { get; set; }

    public int? AitrCompletionTokens { get; set; }

    public decimal? AitrTotalCostAmount { get; set; }

    public string? AitrTotalCostCurrencyCode { get; set; }

    public DateTime? AitrStartedAt { get; set; }

    public DateTime? AitrCompletedAt { get; set; }

    public DateTime AitrCreatedAt { get; set; }

    public virtual ICollection<AiDocumentExtraction> AiDocumentExtractions { get; set; } = new List<AiDocumentExtraction>();

    public virtual ICollection<AiFeedback> AiFeedbacks { get; set; } = new List<AiFeedback>();

    public virtual ICollection<AiMessage> AiMessages { get; set; } = new List<AiMessage>();

    public virtual ICollection<AiSuggestion> AiSuggestions { get; set; } = new List<AiSuggestion>();

    public virtual ICollection<AiTrainingItem> AiTrainingItems { get; set; } = new List<AiTrainingItem>();

    public virtual CmpBrand? AitrBrand { get; set; }

    public virtual CmpLegalEntity? AitrLegalEntity { get; set; }

    public virtual AiModel? AitrModel { get; set; }

    public virtual CmpOffice? AitrOrgOffice { get; set; }

    public virtual AiPromptTemplate? AitrPromptTemplate { get; set; }

    public virtual SysAitaskStatus AitrStatusNavigation { get; set; } = null!;

    public virtual SysAitaskType AitrTaskTypeNavigation { get; set; } = null!;

    public virtual ICollection<AuditEvent> AuditEvents { get; set; } = new List<AuditEvent>();

    public virtual ICollection<ClmAiinsight> ClmAiinsights { get; set; } = new List<ClmAiinsight>();

    public virtual ICollection<ClmEvidenceItem> ClmEvidenceItems { get; set; } = new List<ClmEvidenceItem>();

    public virtual ICollection<CommAiclassification> CommAiclassifications { get; set; } = new List<CommAiclassification>();

    public virtual ICollection<CommAipolicyRun> CommAipolicyRuns { get; set; } = new List<CommAipolicyRun>();

    public virtual ICollection<CommCallAioutput> CommCallAioutputs { get; set; } = new List<CommCallAioutput>();

    public virtual ICollection<CrmActivityWorkflowRun> CrmActivityWorkflowRuns { get; set; } = new List<CrmActivityWorkflowRun>();

    public virtual ICollection<CrmAifocusArea> CrmAifocusAreas { get; set; } = new List<CrmAifocusArea>();

    public virtual ICollection<CrmAiinsight> CrmAiinsights { get; set; } = new List<CrmAiinsight>();

    public virtual ICollection<CrmAutomationRun> CrmAutomationRuns { get; set; } = new List<CrmAutomationRun>();

    public virtual ICollection<CrmChurnRiskScore> CrmChurnRiskScores { get; set; } = new List<CrmChurnRiskScore>();

    public virtual ICollection<CrmDataRequestResponse> CrmDataRequestResponses { get; set; } = new List<CrmDataRequestResponse>();

    public virtual ICollection<CrmDuplicateCandidate> CrmDuplicateCandidates { get; set; } = new List<CrmDuplicateCandidate>();

    public virtual ICollection<CrmGrowthSignal> CrmGrowthSignals { get; set; } = new List<CrmGrowthSignal>();

    public virtual ICollection<CrmLeadStatusHistory> CrmLeadStatusHistories { get; set; } = new List<CrmLeadStatusHistory>();

    public virtual ICollection<CrmMarketFeedbackItem> CrmMarketFeedbackItems { get; set; } = new List<CrmMarketFeedbackItem>();

    public virtual ICollection<CrmMarketFeedbackTheme> CrmMarketFeedbackThemes { get; set; } = new List<CrmMarketFeedbackTheme>();

    public virtual ICollection<CrmOpportunityStageHistory> CrmOpportunityStageHistories { get; set; } = new List<CrmOpportunityStageHistory>();

    public virtual ICollection<CrmPersonalMessageDraft> CrmPersonalMessageDrafts { get; set; } = new List<CrmPersonalMessageDraft>();

    public virtual ICollection<CrmQuoteFollowupAiinsight> CrmQuoteFollowupAiinsights { get; set; } = new List<CrmQuoteFollowupAiinsight>();

    public virtual ICollection<CrmQuoteFollowupResponse> CrmQuoteFollowupResponses { get; set; } = new List<CrmQuoteFollowupResponse>();

    public virtual ICollection<CrmQuoteWinProbability> CrmQuoteWinProbabilities { get; set; } = new List<CrmQuoteWinProbability>();

    public virtual ICollection<CrmSalesPitchAnalysis> CrmSalesPitchAnalyses { get; set; } = new List<CrmSalesPitchAnalysis>();

    public virtual ICollection<CrmSentimentSignal> CrmSentimentSignals { get; set; } = new List<CrmSentimentSignal>();

    public virtual ICollection<EdiAiinsight> EdiAiinsights { get; set; } = new List<EdiAiinsight>();

    public virtual ICollection<EdiProcessingRun> EdiProcessingRuns { get; set; } = new List<EdiProcessingRun>();

    public virtual ICollection<FinAiinsight> FinAiinsights { get; set; } = new List<FinAiinsight>();

    public virtual ICollection<TceAiinsight> TceAiinsights { get; set; } = new List<TceAiinsight>();

    public virtual ICollection<TceHsclassification> TceHsclassifications { get; set; } = new List<TceHsclassification>();

    public virtual ICollection<TceOriginDeclaration> TceOriginDeclarations { get; set; } = new List<TceOriginDeclaration>();

    public virtual ICollection<TcePreferenceClaim> TcePreferenceClaims { get; set; } = new List<TcePreferenceClaim>();

    public virtual ICollection<WorkflowAutomationRun> WorkflowAutomationRuns { get; set; } = new List<WorkflowAutomationRun>();

    public virtual ICollection<WorkflowTask> WorkflowTasks { get; set; } = new List<WorkflowTask>();
}
