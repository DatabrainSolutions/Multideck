using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmnotificationStatus
{
    public string ClmnotificationStatusCode { get; set; } = null!;

    public string ClmnotificationStatusName { get; set; } = null!;

    public string? ClmnotificationStatusDescription { get; set; }

    public bool ClmnotificationStatusIsOpen { get; set; }

    public bool ClmnotificationStatusIsFinal { get; set; }

    public bool ClmnotificationStatusIsActive { get; set; }

    public int ClmnotificationStatusSortOrder { get; set; }

    public virtual ICollection<ClmInsuranceNotification> ClmInsuranceNotifications { get; set; } = new List<ClmInsuranceNotification>();

    public virtual ICollection<ClmSurveyAppointment> ClmSurveyAppointments { get; set; } = new List<ClmSurveyAppointment>();
}
