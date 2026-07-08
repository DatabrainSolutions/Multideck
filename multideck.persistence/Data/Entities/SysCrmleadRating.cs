using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmleadRating
{
    public string CrmleadRatingCode { get; set; } = null!;

    public string CrmleadRatingName { get; set; } = null!;

    public string? CrmleadRatingDescription { get; set; }

    public decimal? CrmleadRatingScoreFloor { get; set; }

    public decimal? CrmleadRatingScoreCeiling { get; set; }

    public bool CrmleadRatingIsActive { get; set; }

    public int CrmleadRatingSortOrder { get; set; }

    public virtual ICollection<CrmLead> CrmLeads { get; set; } = new List<CrmLead>();
}
