using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmcampaignType
{
    public string CrmcampaignTypeCode { get; set; } = null!;

    public string CrmcampaignTypeName { get; set; } = null!;

    public string? CrmcampaignTypeDescription { get; set; }

    public bool CrmcampaignTypeIsActive { get; set; }

    public int CrmcampaignTypeSortOrder { get; set; }

    public virtual ICollection<CrmCampaign> CrmCampaigns { get; set; } = new List<CrmCampaign>();
}
