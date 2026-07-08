using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsAiinsight
{
    public Guid WmsaiinsightId { get; set; }

    public Guid? WmsaiinsightFacilityId { get; set; }

    public string WmsaiinsightInsightTypeCode { get; set; } = null!;

    public string WmsaiinsightStatusCode { get; set; } = null!;

    public string WmsaiinsightTitle { get; set; } = null!;

    public string WmsaiinsightSummary { get; set; } = null!;

    public string? WmsaiinsightRecommendation { get; set; }

    public decimal? WmsaiinsightConfidenceScore { get; set; }

    public decimal? WmsaiinsightRiskScore { get; set; }

    public Guid? WmsaiinsightOrderId { get; set; }

    public Guid? WmsaiinsightBalanceId { get; set; }

    public Guid? WmsaiinsightExceptionId { get; set; }

    public Guid? WmsaiinsightJobId { get; set; }

    public Guid? WmsaiinsightAitaskRunId { get; set; }

    public string WmsaiinsightEvidenceJson { get; set; } = null!;

    public string? WmsaiinsightUserDecisionCode { get; set; }

    public DateTime? WmsaiinsightUserDecisionAt { get; set; }

    public Guid? WmsaiinsightUserDecisionBy { get; set; }

    public DateTime WmsaiinsightCreatedAt { get; set; }

    public virtual WmsInventoryBalance? WmsaiinsightBalance { get; set; }

    public virtual WmsException? WmsaiinsightException { get; set; }

    public virtual WmsFacility? WmsaiinsightFacility { get; set; }

    public virtual SysWmsaiinsightType WmsaiinsightInsightTypeCodeNavigation { get; set; } = null!;

    public virtual JobHeader? WmsaiinsightJob { get; set; }

    public virtual WmsOrder? WmsaiinsightOrder { get; set; }

    public virtual CmpUser? WmsaiinsightUserDecisionByNavigation { get; set; }
}
