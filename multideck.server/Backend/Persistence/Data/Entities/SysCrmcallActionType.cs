using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmcallActionType
{
    public string CrmcallActionTypeCode { get; set; } = null!;

    public string CrmcallActionTypeName { get; set; } = null!;

    public string? CrmcallActionTypeDescription { get; set; }

    public string? CrmcallActionTypeDefaultNextBestActionCode { get; set; }

    public bool CrmcallActionTypeIsActive { get; set; }

    public int CrmcallActionTypeSortOrder { get; set; }

    public virtual ICollection<CrmCallActionCandidate> CrmCallActionCandidates { get; set; } = new List<CrmCallActionCandidate>();

    public virtual SysCrmnextBestActionType? CrmcallActionTypeDefaultNextBestActionCodeNavigation { get; set; }
}
