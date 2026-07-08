using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmpitchRecommendationStatus
{
    public string CrmpitchRecStatusCode { get; set; } = null!;

    public string CrmpitchRecStatusName { get; set; } = null!;

    public string? CrmpitchRecStatusDescription { get; set; }

    public bool CrmpitchRecStatusIsClosed { get; set; }

    public bool CrmpitchRecStatusIsActive { get; set; }

    public int CrmpitchRecStatusSortOrder { get; set; }

    public virtual ICollection<CrmSalesPitchRecommendation> CrmSalesPitchRecommendations { get; set; } = new List<CrmSalesPitchRecommendation>();
}
