using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmnotificationType
{
    public string ClmnotificationTypeCode { get; set; } = null!;

    public string ClmnotificationTypeName { get; set; } = null!;

    public string? ClmnotificationTypeDescription { get; set; }

    public bool ClmnotificationTypeIsActive { get; set; }

    public int ClmnotificationTypeSortOrder { get; set; }

    public virtual ICollection<ClmInsuranceNotification> ClmInsuranceNotifications { get; set; } = new List<ClmInsuranceNotification>();
}
