using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ObsAiactionLog
{
    public Guid ObsaiactionId { get; set; }

    public Guid? ObsaiactionUserId { get; set; }

    public string? ObsaiactionModuleCode { get; set; }

    public string ObsaiactionActionCode { get; set; } = null!;

    public string? ObsaiactionSourceTable { get; set; }

    public Guid? ObsaiactionSourceId { get; set; }

    public string? ObsaiactionTargetTable { get; set; }

    public Guid? ObsaiactionTargetId { get; set; }

    public string ObsaiactionStatusCode { get; set; } = null!;

    public decimal? ObsaiactionConfidence { get; set; }

    public string? ObsaiactionUserDecisionCode { get; set; }

    public string? ObsaiactionPromptHashSha256 { get; set; }

    public string? ObsaiactionResultSummary { get; set; }

    public string ObsaiactionAuditJson { get; set; } = null!;

    public DateTime ObsaiactionCreatedAt { get; set; }

    public virtual SysSubmoduleCode? ObsaiactionModuleCodeNavigation { get; set; }

    public virtual SysObsrunStatus ObsaiactionStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? ObsaiactionUser { get; set; }
}
