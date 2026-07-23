using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmopportunityStage
{
    public string CrmstageCode { get; set; } = null!;

    public string CrmstageName { get; set; } = null!;

    public string? CrmstageDescription { get; set; }

    public decimal? CrmstageDefaultProbabilityPct { get; set; }

    public bool CrmstageIsOpen { get; set; }

    public bool CrmstageIsWon { get; set; }

    public bool CrmstageIsLost { get; set; }

    public bool CrmstageIsActive { get; set; }

    public int CrmstageSortOrder { get; set; }

    public DateTime CrmstageCreatedAt { get; set; }

    public virtual ICollection<CrmOpportunity> CrmOpportunities { get; set; } = new List<CrmOpportunity>();

    public virtual ICollection<CrmOpportunityStageHistory> CrmOpportunityStageHistoryCrmopptyStageFromStageCodeNavigations { get; set; } = new List<CrmOpportunityStageHistory>();

    public virtual ICollection<CrmOpportunityStageHistory> CrmOpportunityStageHistoryCrmopptyStageToStageCodeNavigations { get; set; } = new List<CrmOpportunityStageHistory>();
}
