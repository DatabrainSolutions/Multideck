using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmdataCaptureMethod
{
    public string CrmdataCapMethodCode { get; set; } = null!;

    public string CrmdataCapMethodName { get; set; } = null!;

    public string? CrmdataCapMethodDescription { get; set; }

    public bool CrmdataCapMethodIsExternal { get; set; }

    public bool CrmdataCapMethodIsActive { get; set; }

    public int CrmdataCapMethodSortOrder { get; set; }

    public virtual ICollection<CrmDataCaptureSession> CrmDataCaptureSessions { get; set; } = new List<CrmDataCaptureSession>();

    public virtual ICollection<CrmDataRequestResponse> CrmDataRequestResponses { get; set; } = new List<CrmDataRequestResponse>();

    public virtual ICollection<CrmDataRequest> CrmDataRequests { get; set; } = new List<CrmDataRequest>();
}
