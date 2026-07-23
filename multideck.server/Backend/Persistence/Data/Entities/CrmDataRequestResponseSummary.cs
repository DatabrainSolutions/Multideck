using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmDataRequestResponseSummary
{
    public Guid? CrmdataReqId { get; set; }

    public string? CrmdataReqStatusCode { get; set; }

    public Guid? CrmdataReqCustomerOrgId { get; set; }

    public string? CustomerName { get; set; }

    public string? CrmdataReqChannelCode { get; set; }

    public long? RequestedFieldCount { get; set; }

    public long? ReceivedFieldCount { get; set; }

    public long? ResponseCount { get; set; }

    public long? FieldUpdateCount { get; set; }

    public long? AppliedFieldUpdateCount { get; set; }

    public DateTime? LastResponseAt { get; set; }
}
