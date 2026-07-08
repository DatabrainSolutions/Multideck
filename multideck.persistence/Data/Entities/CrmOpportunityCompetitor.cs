using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmOpportunityCompetitor
{
    public Guid CrmopptyCompId { get; set; }

    public Guid CrmopptyCompOpportunityId { get; set; }

    public Guid? CrmopptyCompCompetitorOrgId { get; set; }

    public string? CrmopptyCompCompetitorNameSnapshot { get; set; }

    public string? CrmopptyCompCompetitorTypeCode { get; set; }

    public decimal? CrmopptyCompStrengthScore { get; set; }

    public decimal? CrmopptyCompPriceAmount { get; set; }

    public string? CrmopptyCompCurrencyCode { get; set; }

    public string? CrmopptyCompServiceNotes { get; set; }

    public bool CrmopptyCompIsWinner { get; set; }

    public DateTime CrmopptyCompCreatedAt { get; set; }

    public Guid? CrmopptyCompCreatedBy { get; set; }

    public virtual OrgMaster? CrmopptyCompCompetitorOrg { get; set; }

    public virtual SysCrmcompetitorType? CrmopptyCompCompetitorTypeCodeNavigation { get; set; }

    public virtual CmpUser? CrmopptyCompCreatedByNavigation { get; set; }

    public virtual CrmOpportunity CrmopptyCompOpportunity { get; set; } = null!;
}
