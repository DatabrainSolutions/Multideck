using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmDataRequestQueue
{
    public Guid? CrmdataReqId { get; set; }

    public Guid? CrmdataReqRunId { get; set; }

    public string? CrmdataReqStatusCode { get; set; }

    public string? CrmdataReqMethodCode { get; set; }

    public string? CrmdataReqChannelCode { get; set; }

    public Guid? CrmdataReqCustomerOrgId { get; set; }

    public string? CrmdataReqCustomerName { get; set; }

    public Guid? CrmdataReqAssignedUserId { get; set; }

    public string? CrmdataReqAssignedUserEmail { get; set; }

    public string? CrmdataReqSubject { get; set; }

    public string? CrmdataReqRequestText { get; set; }

    public DateTime? CrmdataReqDueAt { get; set; }

    public long? CrmdataReqFieldCount { get; set; }

    public long? CrmdataReqReceivedFieldCount { get; set; }

    public DateTime? CrmdataReqCreatedAt { get; set; }
}
