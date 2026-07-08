using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmdataRequestStatus
{
    public string CrmdataReqStatusCode { get; set; } = null!;

    public string CrmdataReqStatusName { get; set; } = null!;

    public string? CrmdataReqStatusDescription { get; set; }

    public bool CrmdataReqStatusIsOpen { get; set; }

    public bool CrmdataReqStatusIsFinal { get; set; }

    public bool CrmdataReqStatusIsActive { get; set; }

    public int CrmdataReqStatusSortOrder { get; set; }

    public virtual ICollection<CrmDataRequestField> CrmDataRequestFields { get; set; } = new List<CrmDataRequestField>();

    public virtual ICollection<CrmDataRequest> CrmDataRequests { get; set; } = new List<CrmDataRequest>();
}
